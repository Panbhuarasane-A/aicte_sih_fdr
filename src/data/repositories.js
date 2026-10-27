import { api } from '../lib/api.js';

export function createRepositories(client) {
  return {
    institutionsRepo: {
      list: (region) => client.getInstitutions(region),
      get: (id) => client.getInstitution(id),
      getDepositCalc: (id, paidOverride) => client.getDepositCalc(id, paidOverride),
    },
    claimsRepo: {
      list: (status) => client.getClaims(status),
      submit: (data) => client.submitClaim(data),
      rerunMatch: (id) => client.verifyClaim(id),
      verify: (id, notes) => client.officerVerifyClaim(id, notes),
      requestClarification: (id, notes) => client.clarifyClaim(id, notes),
    },
    statementRepo: {
      list: () => client.getStatements(),
      import: (formData) => client.importStatement(formData),
      reverifyAll: () => client.reverifyClaims(),
    },
    documentsRepo: {
      list: (institutionId) => client.getDocuments(institutionId),
      upload: (formData) => client.uploadDocument(formData),
      getExtraction: (id) => client.getDocumentExtraction(id),
      getScreening: (id) => client.getDocumentScreening(id),
    },
    fdrRepo: {
      list: (params) => client.getInstruments(params),
      create: (data) => client.createInstrument(data),
      update: (id, data) => client.updateInstrument(id, data),
    },
    releaseRepo: {
      list: () => client.getReleaseRequests(),
      submit: (data) => client.submitReleaseRequest(data),
      recommend: (id, notes) => client.recommendRelease(id, notes),
      authorize: (id, speakingOrderRef, notes) => client.authoriseRelease(id, speakingOrderRef, notes),
      reject: (id, notes) => client.rejectRelease(id, notes),
    },
    auditRepo: {
      list: (limit) => client.getAuditTrail(limit),
      verifyChain: () => client.verifyAuditChain(),
    },
    reportsRepo: {
      download: (reportType) => client.downloadReport(reportType),
    },
    assistantRepo: {
      ask: (query) => client.askAssistant(query),
      exportResult: (id, format) => client.exportAssistantResult(id, format),
    },
    dashboardRepo: {
      getSummary: () => client.getDashboardSummary(),
    },
    notificationsRepo: {
      getSources: () => Promise.allSettled([
        client.getReleaseRequests(),
        client.getClaims(),
        client.getInstruments(),
      ]),
    },
    announcementsRepo: {
      list: () => client.getAnnouncements(),
      create: (formData) => client.createAnnouncement(formData),
      remove: (id) => client.deleteAnnouncement(id),
      downloadAttachment: (id, index) => client.downloadAnnouncementAttachment(id, index),
    },
    policyRepo: {
      getRules: () => client.getRules(),
      updateRule: (data) => client.updateRule(data),
    },
  };
}

export const {
  institutionsRepo,
  claimsRepo,
  statementRepo,
  documentsRepo,
  fdrRepo,
  releaseRepo,
  auditRepo,
  reportsRepo,
  assistantRepo,
  dashboardRepo,
  notificationsRepo,
  announcementsRepo,
  policyRepo,
} = createRepositories(api);
