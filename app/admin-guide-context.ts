import { accountBusinessIds, type AdminAccount } from "@/app/admin-session";
import { readAnswerSettings } from "@/app/answer-settings";
import { maskResidentRegistrationNumber } from "@/app/resident-number";
import { ensureKnowledgeSchema, type BusinessRow } from "@/db/knowledge";

type SourceCount = { business_id: string; type: string; status: string; enabled: number; count: number; latest_at: number | null };
type ConsultationCount = { business_id: string; decision: string; category: string; count: number; review_count: number };
type RepeatedQuestion = { business_id: string; question: string; count: number };
type ConflictRow = { business_id: string; report: string };

function placeholders(values: string[]) { return values.map(() => "?").join(","); }
function permission(value: number | boolean) { return Boolean(value); }

export async function loadAdminGuideContext(account: AdminAccount) {
  const DB = await ensureKnowledgeSchema();
  const allBusinesses = (await DB.prepare("SELECT * FROM businesses ORDER BY sort_order, created_at, id").all<BusinessRow>()).results;
  const allowedIds = account.is_super_admin ? allBusinesses.map(item => item.id) : accountBusinessIds(account);
  const allowedSet = new Set(allowedIds);
  const businesses = allBusinesses.filter(item => allowedSet.has(item.id));
  const businessNames = new Map(businesses.map(item => [item.id, item.name]));
  const scope = {
    account: {
      username: account.username,
      isSuperAdmin: permission(account.is_super_admin),
      canViewConsultations: permission(account.is_super_admin || account.can_view_consultations),
      canDeleteConsultations: permission(account.is_super_admin || account.can_delete_consultations),
      canManageSettings: permission(account.is_super_admin || account.can_manage_settings),
      accessibleBusinessCount: businesses.length,
    },
    businesses: businesses.map(item => ({
      name: item.name,
      public: permission(item.is_public),
      requiredInformation: {
        noticeUrl: item.notice_url || null,
        contactDepartment: item.contact_department || null,
        contactPhone: item.contact_phone || null,
        contactHours: item.contact_hours || null,
        complete: Boolean(item.notice_url && item.contact_department && item.contact_phone && item.contact_hours),
      },
    })),
  } as Record<string, unknown>;

  if (businesses.length) {
    const ids = businesses.map(item => item.id), marks = placeholders(ids);
    const [sourceRows, conflictRows] = await Promise.all([
      DB.prepare(`SELECT business_id, type, status, enabled, COUNT(*) count, MAX(updated_at) latest_at FROM knowledge_sources WHERE business_id IN (${marks}) GROUP BY business_id, type, status, enabled`).bind(...ids).all<SourceCount>(),
      DB.prepare(`SELECT business_id, report FROM knowledge_conflict_checks WHERE business_id IN (${marks})`).bind(...ids).all<ConflictRow>(),
    ]);
    const conflictByBusiness = new Map<string, { conflicts: number; unavailableSources: number }>();
    for (const row of conflictRows.results) {
      try {
        const report = JSON.parse(row.report) as { conflicts?: unknown[]; unavailableIds?: unknown[] };
        conflictByBusiness.set(row.business_id, { conflicts: Array.isArray(report.conflicts) ? report.conflicts.length : 0, unavailableSources: Array.isArray(report.unavailableIds) ? report.unavailableIds.length : 0 });
      } catch { conflictByBusiness.set(row.business_id, { conflicts: 0, unavailableSources: 1 }); }
    }
    scope.knowledge = businesses.map(business => ({
      business: business.name,
      sources: sourceRows.results.filter(row => row.business_id === business.id).map(row => ({ type: row.type, status: row.status, enabled: permission(row.enabled), count: row.count, latestUpdatedAt: row.latest_at })),
      conflictCheck: conflictByBusiness.get(business.id) || { conflicts: 0, unavailableSources: 0 },
    }));

    if (account.is_super_admin || account.can_view_consultations) {
      const from = Date.now() - 30 * 24 * 60 * 60 * 1_000;
      const [counts, repeated] = await Promise.all([
        DB.prepare(`SELECT business_id, decision, category, COUNT(*) count, SUM(review) review_count FROM consultations WHERE business_id IN (${marks}) AND created_at >= ? GROUP BY business_id, decision, category`).bind(...ids, from).all<ConsultationCount>(),
        DB.prepare(`SELECT business_id, question, COUNT(*) count FROM consultations WHERE business_id IN (${marks}) AND created_at >= ? GROUP BY business_id, question HAVING COUNT(*) > 1 ORDER BY count DESC LIMIT 20`).bind(...ids, from).all<RepeatedQuestion>(),
      ]);
      scope.consultationsLast30Days = {
        byBusiness: businesses.map(business => ({
          business: business.name,
          results: counts.results.filter(row => row.business_id === business.id).map(row => ({ decision: row.decision, category: row.category, count: row.count, reviewRequired: row.review_count })),
        })),
        repeatedQuestions: repeated.results.map(row => ({ business: businessNames.get(row.business_id), question: maskResidentRegistrationNumber(row.question).slice(0, 150), count: row.count })),
      };
    }
  }

  if (account.is_super_admin || account.can_manage_settings) {
    const [settings, usage, accounts] = await Promise.all([
      DB.prepare("SELECT organization_name, contact, main_headline, main_subcopy, chatbot_greeting, primary_color, answer_settings_json, gemini_api_key_encrypted FROM site_settings WHERE id = 'default'").first<Record<string, string | null>>(),
      DB.prepare("SELECT COUNT(*) requests, SUM(CASE WHEN status < 200 OR status >= 300 THEN 1 ELSE 0 END) failed FROM api_usage WHERE created_at >= ?").bind(Date.now() - 30 * 24 * 60 * 60 * 1_000).first<{ requests: number; failed: number }>(),
      DB.prepare("SELECT username, business_ids_json, can_manage_settings, can_view_consultations, can_delete_consultations, is_super_admin FROM admin_accounts ORDER BY is_super_admin DESC, created_at").all<Pick<AdminAccount, "username" | "business_ids_json" | "can_manage_settings" | "can_view_consultations" | "can_delete_consultations" | "is_super_admin">>(),
    ]);
    scope.settings = settings ? {
      organizationName: settings.organization_name,
      contact: settings.contact,
      mainHeadline: settings.main_headline,
      mainSubcopy: settings.main_subcopy,
      chatbotGreeting: settings.chatbot_greeting,
      primaryColor: settings.primary_color,
      answerStyle: readAnswerSettings(settings.answer_settings_json),
      apiKeyConfigured: Boolean(settings.gemini_api_key_encrypted || process.env.GEMINI_API_KEY),
      apiUsageLast30Days: { requests: usage?.requests || 0, failed: usage?.failed || 0 },
    } : null;
    scope.administratorPermissions = accounts.results.map(item => ({
      username: item.username,
      isSuperAdmin: permission(item.is_super_admin),
      canViewConsultations: permission(item.is_super_admin || item.can_view_consultations),
      canDeleteConsultations: permission(item.is_super_admin || item.can_delete_consultations),
      canManageSettings: permission(item.is_super_admin || item.can_manage_settings),
      businesses: item.is_super_admin ? businesses.map(business => business.name) : accountBusinessIds(item as AdminAccount).filter(id => allowedSet.has(id)).map(id => businessNames.get(id)).filter(Boolean),
    }));
  }

  return scope;
}
