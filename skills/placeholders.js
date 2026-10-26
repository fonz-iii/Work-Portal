/* skills/placeholders.js — menu tiles for modules that are not built yet, plus the DRB Usage launcher
   (its own page, drb-usage.html; kept here so it sits first in Digital Banking).
   When a real skill is built, remove its entry here (Industry Ranking: built 2026-10-06; QR Ph P2B Directory: built 2026-10-08; RIB Advisory Generator: built 2026-10-09).
   All sit under the Product Management team (category 'pm', the default). Sections regrouped 2026-10-19 (Fons):
   DRB Enrollees and DRB Idle Accounts are part of DRB Usage; Types of Complaints moves to Customer Service later. */
(function () {
  'use strict';
  [
    { id: 'research-library', title: 'Research Library', group: 'Market & Research', status: 'planned',
      description: 'Browse and search past studies; start a new study from a template.',
      plannedInputs: ['Past studies', 'Templates'], plannedOutputs: ['Browse', 'Search', 'New-study template'] },
    { id: 'drb-usage', title: 'DRB Usage', group: 'Digital Banking', status: 'ready', page: 'drb-usage.html',
      description: 'Quarterly Sterling Bank Online usage: enrolment and user profile, top billers and banks, and quarter-on-quarter comparison, as a worked-figures Excel workbook.' },
    { id: 'kri-report', title: 'KRI Report', group: 'Payments & Risk', status: 'planned',
      description: 'Key Risk Indicators report. Details to follow.',
      plannedInputs: ['To follow'], plannedOutputs: ['To follow'] }
  ].forEach(function (s) { Portal.registerSkill(s); });
})();
