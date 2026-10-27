const STATUS_MAP = {
  quarantined: { label: 'Screening', tone: 'info', icon: '•' },
  screening: { label: 'Screening', tone: 'info', icon: '◌' },
  cleared: { label: 'Processing', tone: 'info', icon: '→' },
  released_by_officer: { label: 'Processing', tone: 'info', icon: '→' },
  held: { label: 'Under review', tone: 'warn', icon: '!' },
  rejected_resubmit: { label: 'Resubmit requested', tone: 'warn', icon: '!' },
  screening_failed: { label: 'Failed screening', tone: 'fail', icon: '×' },
};

export function getInstitutionDocumentStatus(document) {
  if (document?.flags?.length) {
    return { label: 'Needs attention', tone: 'warn', icon: '!' };
  }
  return STATUS_MAP[document?.gate_state] || { label: 'Action required', tone: 'info', icon: '•' };
}

export const INSTITUTION_STATUS_LABELS = Object.freeze(
  Object.fromEntries(Object.entries(STATUS_MAP).map(([key, value]) => [key, value.label]))
);
