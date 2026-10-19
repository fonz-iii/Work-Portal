/* skills/placeholders.js — menu tiles for modules that are not built yet.
   When a real skill is built, remove its entry here (Industry Ranking: built 2026-10-06; QR Ph P2B Directory: built 2026-10-08; RIB Advisory Generator: built 2026-10-09).
   All sit under the Product Management team (category 'pm', the default). Sections regrouped 2026-10-19 (Fons):
   DRB Enrollees and DRB Idle Accounts are part of DRB Usage; Types of Complaints moves to Customer Service later. */
(function () {
  'use strict';
  [
    { id: 'research-library', title: 'Research Library', group: 'Market & Research', status: 'planned',
      description: 'Browse and search past studies; start a new study from a template.',
      plannedInputs: ['Past studies', 'Templates'], plannedOutputs: ['Browse', 'Search', 'New-study template'] },
    { id: 'drb-usage', title: 'DRB Usage', group: 'Digital Banking', status: 'planned',
      description: 'Quarterly Sterling Bank Online usage: enrolment and user profile, top billers and banks, and quarter-on-quarter comparison.',
      note: 'Being built from the DRB Usage skill.',
      plannedInputs: ['DRB Usage export', 'CIF Profile', 'ITCom DCB and DRB Reports', 'RIB Idle Accounts Report', 'RIB Usage (optional)'],
      plannedOutputs: ['Worked-figures Excel workbook', 'On-screen review'] },
    { id: 'kri-report', title: 'KRI Report', group: 'Payments & Risk', status: 'planned',
      description: 'Key Risk Indicators report. Details to follow.',
      plannedInputs: ['To follow'], plannedOutputs: ['To follow'] }
  ].forEach(function (s) { Portal.registerSkill(s); });
})();
