/* skills/placeholders.js — menu tiles for every module in the CLAUDE.md table that is not built yet.
   When a real skill is built, remove its entry here (Industry Ranking: built 2026-10-06; QR Ph P2B Directory: built 2026-10-08; RIB Advisory Generator: built 2026-10-09).
   All sit under the Product Management team (category 'pm', the default). Sections set 2026-10-06. */
(function () {
  'use strict';
  [
    { id: 'drb-usage', title: 'DRB Usage', group: 'DRB Reports', status: 'planned',
      description: 'Usage report with charts.',
      note: 'Waiting for the column layout of the source Excel.',
      plannedInputs: ['Excel (column spec needed)'], plannedOutputs: ['Report', 'Charts'] },
    { id: 'drb-enrollees', title: 'DRB Enrollees', group: 'DRB Reports', status: 'planned',
      description: 'Enrollee report with charts.',
      note: 'Waiting for the column layout of the source Excel.',
      plannedInputs: ['Excel (column spec needed)'], plannedOutputs: ['Report', 'Charts'] },
    { id: 'drb-idle-accounts', title: 'DRB Idle Accounts', group: 'DRB Reports', status: 'planned',
      description: 'Idle account report with charts.',
      note: 'Waiting for the column layout of the source Excel.',
      plannedInputs: ['Excel (column spec needed)'], plannedOutputs: ['Report', 'Charts'] },
    { id: 'research-library', title: 'Research Library', group: 'Research', status: 'planned',
      description: 'Browse and search past studies; start a new study from a template.',
      plannedInputs: ['Past studies', 'Templates'], plannedOutputs: ['Browse', 'Search', 'New-study template'] },
    { id: 'types-of-complaints', title: 'Types of Complaints', group: 'Customer Insights', status: 'on-hold',
      description: 'Complaints report with charts.',
      note: 'On hold pending the data format from Customer Service.',
      plannedInputs: ['TBD'], plannedOutputs: ['Report', 'Charts'] }
  ].forEach(function (s) { Portal.registerSkill(s); });
})();
