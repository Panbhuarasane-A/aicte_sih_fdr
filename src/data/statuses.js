export const MATCH_STATUSES = Object.freeze({
  EXACT_MATCH: {
    label: 'Exact Match',
    color: 'success',
    icon: 'check',
    description: 'Claim details are consistent with an available statement entry.',
  },
  POSSIBLE_MATCH: {
    label: 'Probable Match',
    color: 'warning',
    icon: 'search',
    description: 'A candidate statement entry requires manual review.',
  },
  AMOUNT_MISMATCH: {
    label: 'Amount Mismatch',
    color: 'danger',
    icon: 'alert',
    description: 'The claim amount differs from the available statement entry.',
  },
  REFERENCE_MISMATCH: {
    label: 'Reference Mismatch',
    color: 'danger',
    icon: 'alert',
    description: 'The transaction reference differs from a candidate entry.',
  },
  DATE_MISMATCH: {
    label: 'Date Mismatch',
    color: 'warning',
    icon: 'calendar',
    description: 'The transaction date differs from the available evidence.',
  },
  DUPLICATE_CLAIM: {
    label: 'Duplicate Claim Suspected',
    color: 'danger',
    icon: 'copy',
    description: 'Another claim uses the same transaction reference.',
  },
  MISSING_TRANSACTION: {
    label: 'No Matching Record',
    color: 'neutral',
    icon: 'search',
    description: 'No corresponding entry was found in the available records.',
  },
  INSUFFICIENT_EVIDENCE: {
    label: 'Insufficient Evidence',
    color: 'neutral',
    icon: 'file',
    description: 'Available evidence is insufficient to compare this claim.',
  },
  PENDING: {
    label: 'Pending Manual Review',
    color: 'warning',
    icon: 'clock',
    description: 'An authorized officer has not completed review.',
  },
});

export const FDR_STATUSES = Object.freeze({
  PENDING_VERIFICATION: { label: 'Pending Verification', color: 'warning', icon: 'clock', description: 'Awaiting review.' },
  ACTIVE: { label: 'Active', color: 'success', icon: 'check', description: 'Currently active.' },
  MATURING_SOON: { label: 'Maturing Soon', color: 'warning', icon: 'calendar', description: 'Maturity is approaching.' },
  EXPIRED_OVERDUE: { label: 'Expired / Overdue', color: 'danger', icon: 'alert', description: 'The maturity date has passed.' },
  RENEWED: { label: 'Renewed', color: 'info', icon: 'refresh', description: 'A renewal has been recorded.' },
  REPLACED: { label: 'Replaced', color: 'info', icon: 'refresh', description: 'A replacement instrument has been recorded.' },
  RELEASED: { label: 'Released', color: 'neutral', icon: 'check', description: 'Release is recorded.' },
});

export const RELEASE_STATUSES = Object.freeze({
  DRAFT: { label: 'Draft', color: 'neutral', icon: 'file', description: 'Not yet submitted.' },
  SUBMITTED: { label: 'Submitted', color: 'info', icon: 'file', description: 'Submitted for review.' },
  UNDER_SCRUTINY: { label: 'Under Scrutiny', color: 'warning', icon: 'search', description: 'Under review.' },
  AWAITING_DOCUMENTS: { label: 'Awaiting Documents', color: 'warning', icon: 'clock', description: 'Required documents are outstanding.' },
  COMMITTEE_RECOMMENDED: { label: 'Committee Recommended', color: 'info', icon: 'check', description: 'Recommended by the committee; authority decision is pending.' },
  APPROVED: { label: 'Approved', color: 'success', icon: 'check', description: 'Approved by the competent authority.' },
  REJECTED: { label: 'Rejected', color: 'danger', icon: 'alert', description: 'Rejected by an authorized reviewer.' },
});

export const TRUST_LEVELS = Object.freeze([
  'Extracted',
  'Matched to records',
  'Independently confirmed',
  'Officer reviewed',
  'Competent Authority approved',
]);

export function getStatusDefinition(statusMap, code) {
  return statusMap[code] || null;
}

export function getStatusLabel(statusMap, code, fallback = 'Pending Manual Review') {
  return getStatusDefinition(statusMap, code)?.label || fallback;
}
