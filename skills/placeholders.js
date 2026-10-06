/* skills/placeholders.js — menu tiles for every module in the CLAUDE.md table that is not built yet.
   When a real skill is built, it registers the same id and replaces its placeholder here.
   All sit under the Product Management team (category 'pm', the default). Sections set 2026-10-06. */
(function () {
  'use strict';
  [
    { id: 'industry-ranking', title: 'Industry Ranking', group: 'Benchmarking', status: 'planned',
      description: 'BSP thrift-bank ranking deck and President\'s report.',
      note: 'Logic exists as a Claude skill; to be ported.',
      plannedInputs: ['BSP "Ranking as to ..." PDFs (public)'], plannedOutputs: ['HTML slide deck', '2-page Word report'] },
    { id: 'qrph-p2b-directory', title: 'QR Ph P2B Biller Directory', group: 'RIB', status: 'planned',
      description: 'Alphabetized Word directory from the biller masterlist.',
      note: 'Logic exists as a Claude skill; to be ported.',
      plannedInputs: ['P2B Biller Masterlist Excel'], plannedOutputs: ['Alphabetized Word directory'] },
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
    { id: 'rib-advisory-formatter', title: 'RIB Advisory Formatter', group: 'RIB', status: 'planned',
      description: 'Clean advisory text for the UAT editor, plus a status tracker.',
      note: 'Waiting for formatting rules and a before/after example.',
      plannedInputs: ['Pasted advisory text'], plannedOutputs: ['Clean plain text for the UAT editor', 'Status tracker: received / drafted in UAT / for approval / posted to Prod'] },
    { id: 'research-library', title: 'Research Library', group: 'Research', status: 'planned',
      description: 'Browse and search past studies; start a new study from a template.',
      plannedInputs: ['Past studies', 'Templates'], plannedOutputs: ['Browse', 'Search', 'New-study template'] },
    { id: 'types-of-complaints', title: 'Types of Complaints', group: 'Customer Insights', status: 'on-hold',
      description: 'Complaints report with charts.',
      note: 'On hold pending the data format from Customer Service.',
      plannedInputs: ['TBD'], plannedOutputs: ['Report', 'Charts'] }
  ].forEach(function (s) { Portal.registerSkill(s); });
})();
