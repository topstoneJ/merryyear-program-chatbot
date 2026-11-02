"""Inspect or apply the existing application's review settings without logging secrets."""
import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path


def az(*args):
    result = subprocess.run(['az', *args, '--output', 'json'], capture_output=True, text=True)
    if result.returncode:
        code = re.search(r'\((AuthorizationFailed|ResourceNotFound|Forbidden|[A-Za-z]+Error)\)', result.stderr)
        raise RuntimeError('Azure command failed: ' + ' '.join(args[:3]) + (' [' + code.group(1) + ']' if code else ''))
    return json.loads(result.stdout) if result.stdout.strip() else None


group = os.environ['AZURE_RESOURCE_GROUP']
name = os.environ['AZURE_WEBAPP_NAME']
scope = ['--resource-group', group, '--name', name]
mode = os.environ.get('REVIEW_MODE', 'inspect')
if mode == 'apply':
    key = os.environ.get('RETENTION_MAINTENANCE_KEY', '')
    if len(key) < 32:
        raise RuntimeError('Separate maintenance secret is required')
    az('webapp', 'update', *scope, '--https-only', 'true')
    az('webapp', 'config', 'set', *scope, '--generic-configurations',
       json.dumps({'minTlsVersion': '1.2', 'scmMinTlsVersion': '1.2'}))
    az('webapp', 'config', 'appsettings', 'set', *scope, '--settings', 'RETENTION_MAINTENANCE_KEY=' + key)

app = az('webapp', 'show', *scope)
config = az('webapp', 'config', 'show', *scope)
settings = {s['name']: s.get('value', '') for s in az('webapp', 'config', 'appsettings', 'list', *scope)}
try:
    resources = az('resource', 'list', '--resource-group', group,
                   '--query', '[].{name:name,type:type,location:location}')
    inventory_available = True
except RuntimeError:
    resources = []
    inventory_available = False
runtime = None
runtime_error = None
try:
    token = az('account', 'get-access-token', '--resource', 'https://management.azure.com/')['accessToken']
    host = next(h['name'] for h in app['hostNameSslStates'] if h.get('hostType') == 'Repository')
    payload = json.dumps({'command': 'node --version', 'dir': '/home/site/wwwroot'}).encode()
    request = urllib.request.Request('https://' + host + '/api/command', data=payload,
                                     headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=45) as response:
        output = json.load(response)
    match = re.search(r'v\d+\.\d+\.\d+', output.get('Output', ''))
    runtime = match.group() if match else None
except Exception as error:
    runtime_error = type(error).__name__

try:
    plan = az('appservice', 'plan', 'show', '--ids', app['serverFarmId'])
    plan_info = {'sku': plan['sku'], 'location': plan['location']}
except RuntimeError as error:
    plan_info = {'unavailable': str(error)}
report = {
    'mode': mode, 'app': name, 'location': app['location'], 'state': app['state'],
    'httpsOnly': app['httpsOnly'], 'minTlsVersion': config['minTlsVersion'],
    'scmMinTlsVersion': config.get('scmMinTlsVersion'), 'linuxFxVersion': config['linuxFxVersion'],
    'scmNode': runtime, 'runtimeProbeError': runtime_error,
    'plan': plan_info, 'resources': resources,
    'resourceInventoryAvailable': inventory_available,
    'settings': {k: settings[k] for k in ['DOCLING_SERVICE_URL', 'AZURE_STORAGE_ACCOUNT_NAME',
        'AZURE_STORAGE_CONTAINER_NAME', 'GEMINI_MODEL', 'OPENAI_MODEL', 'ANTHROPIC_MODEL'] if k in settings},
    'maintenanceConfigured': len(settings.get('RETENTION_MAINTENANCE_KEY', '')) >= 32,
}
Path('operations-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
