"""Verify the deployed Gemini model without logging credentials or response text."""

import argparse
from datetime import datetime, timedelta, timezone
import http.cookiejar
import json
import math
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request


class CheckFailed(Exception):
    """Only static, allowlisted reason codes may cross the reporting boundary."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def korean_date():
    return datetime.now(timezone(timedelta(hours=9))).date().isoformat()


def read_settings(group, name):
    try:
        result = subprocess.run(
            ["az", "webapp", "config", "appsettings", "list", "--resource-group", group,
             "--name", name, "--output", "json", "--only-show-errors"],
            capture_output=True, text=True, check=False, timeout=90,
        )
        if result.returncode:
            raise CheckFailed("azure_settings_unavailable")
        values = json.loads(result.stdout)
        if not isinstance(values, list):
            raise CheckFailed("azure_settings_invalid")
        return {item["name"]: item.get("value", "") for item in values
                if isinstance(item, dict) and isinstance(item.get("name"), str)}
    except CheckFailed:
        raise
    except Exception:
        raise CheckFailed("azure_settings_unavailable") from None


def request_json(opener, url, body=None, timeout=30):
    headers = {"Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8") if body is not None else None,
        headers=headers, method="POST" if body is not None else "GET",
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            status = response.status
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None
    except Exception:
        return None, None
    return status, payload if isinstance(payload, dict) else None


def counter(value):
    # PostgreSQL COUNT/SUM values may be serialized as decimal strings.
    if isinstance(value, str) and re.fullmatch(r"\d+", value):
        value = int(value)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise CheckFailed("usage_counters_invalid")
    return value


def model_usage(payload, model):
    rows = payload.get("models")
    if not isinstance(rows, list):
        raise CheckFailed("usage_counters_invalid")
    for item in rows:
        if isinstance(item, dict) and item.get("model") == model:
            return {field: counter(item.get(field))
                    for field in ("requests", "inputTokens", "outputTokens")}
    return {"requests": 0, "inputTokens": 0, "outputTokens": 0}


def check_management(payload, model):
    if payload.get("model") != model or payload.get("apiProvider") != "google":
        raise CheckFailed("active_model_or_provider_mismatch")
    rates = payload.get("rates")
    if not isinstance(rates, dict):
        raise CheckFailed("model_rates_unavailable")
    expected = {"input": 1.5, "output": 7.5, "cached": 0.075}
    for field, amount in expected.items():
        value = rates.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise CheckFailed("model_rates_invalid")
        if model == "gemini-4-hydrogen" and not math.isclose(value, amount, rel_tol=0, abs_tol=1e-12):
            raise CheckFailed("model_rates_mismatch")


def management_url(base, first_date):
    return base + "/api/api-management?" + urllib.parse.urlencode(
        {"from": first_date, "to": korean_date()})


def verify(args, report):
    settings = read_settings(args.resource_group, args.name)
    if settings.get("GEMINI_MODEL") != args.expected_model:
        raise CheckFailed("configured_model_mismatch")
    report["settingsCheck"] = "passed"
    report["model"] = args.expected_model

    admin_id, password = settings.get("ADMIN_ID"), settings.get("ADMIN_PASSWORD")
    if not isinstance(admin_id, str) or not admin_id or not isinstance(password, str) or not password:
        report.update(authenticatedCheck="unavailable", reason="administrator_credentials_unavailable")
        return 0
    opener = urllib.request.build_opener(
        NoRedirect(), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    # Exactly one normal login attempt; never reset credentials or mint sessions.
    status, login = request_json(opener, args.url + "/api/admin-login",
                                 {"id": admin_id, "password": password})
    if status != 200 or not login or login.get("ok") is not True:
        report.update(authenticatedCheck="unavailable", reason="administrator_login_unavailable")
        return 0

    first_date = korean_date()
    status, before = request_json(opener, management_url(args.url, first_date))
    if status in (401, 403):
        report.update(authenticatedCheck="unavailable", reason="administrator_access_unavailable")
        return 0
    if status != 200 or before is None:
        raise CheckFailed("management_check_failed")
    check_management(before, args.expected_model)
    baseline = model_usage(before, args.expected_model)
    report["activeModelCheck"] = "passed"

    # This existing guide route does not create consultation records or use FAQ answers.
    status, chat = request_json(opener, args.url + "/api/chat", {
        "businessId": "__admin-guide",
        "question": "사업 자료를 등록하는 방법을 한 문장으로 알려주세요.",
        "history": [],
    }, timeout=90)
    answer = chat.get("answer") if chat else None
    if (status != 200 or not isinstance(answer, dict) or answer.get("confidence") != 95
            or not isinstance(answer.get("text"), str) or not answer["text"].strip()):
        raise CheckFailed("live_ai_answer_failed")

    status, after = request_json(opener, management_url(args.url, first_date))
    if status != 200 or after is None:
        raise CheckFailed("usage_check_failed")
    check_management(after, args.expected_model)
    observed = model_usage(after, args.expected_model)
    delta = {field: observed[field] - baseline[field] for field in baseline}
    report["usageDelta"] = delta
    # Other users can make requests concurrently; global failures are informational.
    before_failed = (before.get("totals") or {}).get("failed")
    after_failed = (after.get("totals") or {}).get("failed")
    report["globalFailedDelta"] = counter(after_failed or 0) - counter(before_failed or 0)
    if delta["requests"] < 1 or delta["inputTokens"] <= 0 or delta["outputTokens"] <= 0:
        raise CheckFailed("live_ai_usage_not_observed")
    report["authenticatedCheck"] = "passed"
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resource-group", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--expected-model", default="gemini-4-hydrogen")
    args = parser.parse_args()
    parsed = urllib.parse.urlsplit(args.url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        parser.error("url must be an HTTPS application origin")
    if not re.fullmatch(r"gemini-[a-z0-9-]{1,100}", args.expected_model):
        parser.error("expected-model must be a Gemini model ID")
    args.url = args.url.rstrip("/")
    report = {"settingsCheck": "failed", "authenticatedCheck": "not_run"}
    try:
        exit_code = verify(args, report)
    except CheckFailed as error:
        report.update(authenticatedCheck="failed", reason=str(error))
        exit_code = 1
    except Exception:
        report.update(authenticatedCheck="failed", reason="deployment_verification_failed")
        exit_code = 1
    print(json.dumps(report, ensure_ascii=True, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
