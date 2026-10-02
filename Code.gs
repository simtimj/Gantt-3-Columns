function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Focus Workspace')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupWorkspace() {
  const days = getOrCreateSheet_('Days', ['Date', 'Today', 'Journal']);
  const reference = getOrCreateSheet_('Reference', [
    'ID',
    'ParentID',
    'Type',
    'Title',
    'Content',
    'Expanded',
    'Sort'
  ]);

  // Keep a reasonable amount of stored date coverage.
  // The browser only loads one week at a time.
  ensureDayRange_(days, 730, 365);

  days.setFrozenRows(1);
  reference.setFrozenRows(1);
  days.getRange('A:A').setNumberFormat('yyyy-mm-dd');

  return true;
}


/* =========================================================
   WEB APP DATA
   ========================================================= */

function getWorkspaceData() {
  setupWorkspace();

  const today = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );

  const start = weekStart_(today);
  const end = addDaysToDateString_(start, 6);

  return {
    days: getDaysRange_(start, end),
    reference: getReference_(),
    today: today
  };
}


function getDaysRange(startDate, endDate) {
  setupWorkspace();
  return getDaysRange_(startDate, endDate);
}


function getDaysRange_(startDate, endDate) {
  const sheet = getOrCreateSheet_(
    'Days',
    ['Date', 'Today', 'Journal']
  );

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const out = [];

  for (let i = 1; i < values.length; i++) {
    const date = formatDate_(values[i][0]);

    if (!date) continue;

    if (date >= startDate && date <= endDate) {
      out.push({
        date: date,
        tasks: String(values[i][1] || ''),
        journal: String(values[i][2] || '')
      });
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));

  return out;
}


/* =========================================================
   DAY SAVING
   ========================================================= */

function saveDay(dateString, tasks, journal) {
  const sheet = getOrCreateSheet_(
    'Days',
    ['Date', 'Today', 'Journal']
  );

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (formatDate_(values[i][0]) === dateString) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([
        [
          tasks || '',
          journal || ''
        ]
      ]);

      return true;
    }
  }

  sheet.appendRow([
    parseDate_(dateString),
    tasks || '',
    journal || ''
  ]);

  return true;
}


/* =========================================================
   REFERENCE
   ========================================================= */

function getReference_() {
  const sheet = getOrCreateSheet_(
    'Reference',
    [
      'ID',
      'ParentID',
      'Type',
      'Title',
      'Content',
      'Expanded',
      'Sort'
    ]
  );

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  return values
    .slice(1)
    .map((row, index) => ({
      row: index + 2,
      id: String(row[0] || ''),
      parentId: String(row[1] || ''),
      type: String(row[2] || 'item'),
      title: String(row[3] || ''),
      content: String(row[4] || ''),
      expanded: row[5] !== false,
      sort: Number(row[6]) || index
    }))
    .sort((a, b) => a.sort - b.sort);
}


function saveReferenceItem(item) {
  const sheet = getOrCreateSheet_(
    'Reference',
    [
      'ID',
      'ParentID',
      'Type',
      'Title',
      'Content',
      'Expanded',
      'Sort'
    ]
  );

  const values = sheet.getDataRange().getValues();
  const id = String(item.id || Utilities.getUuid());

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      sheet.getRange(i + 1, 1, 1, 7).setValues([
        [
          id,
          item.parentId || '',
          item.type || 'item',
          item.title || '',
          item.content || '',
          item.expanded !== false,
          Number(item.sort) || i
        ]
      ]);

      return id;
    }
  }

  sheet.appendRow([
    id,
    item.parentId || '',
    item.type || 'item',
    item.title || '',
    item.content || '',
    item.expanded !== false,
    Number(item.sort) || sheet.getLastRow()
  ]);

  return id;
}


function addReferenceItem(parentId, title, content) {
  const sheet = getOrCreateSheet_(
    'Reference',
    [
      'ID',
      'ParentID',
      'Type',
      'Title',
      'Content',
      'Expanded',
      'Sort'
    ]
  );

  const id = Utilities.getUuid();

  sheet.appendRow([
    id,
    parentId || '',
    'item',
    title || '',
    content || '',
    true,
    sheet.getLastRow()
  ]);

  return id;
}


function deleteReferenceItem(id) {
  const sheet = getOrCreateSheet_(
    'Reference',
    [
      'ID',
      'ParentID',
      'Type',
      'Title',
      'Content',
      'Expanded',
      'Sort'
    ]
  );

  const values = sheet.getDataRange().getValues();

  const idsToDelete = new Set([
    String(id)
  ]);

  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 1; i < values.length; i++) {
      const childId = String(values[i][0] || '');
      const parentId = String(values[i][1] || '');

      if (
        idsToDelete.has(parentId) &&
        !idsToDelete.has(childId)
      ) {
        idsToDelete.add(childId);
        changed = true;
      }
    }
  }

  for (let i = values.length - 1; i >= 1; i--) {
    if (idsToDelete.has(String(values[i][0]))) {
      sheet.deleteRow(i + 1);
    }
  }

  return true;
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function weekStart_(dateString) {
  const date = parseDate_(dateString);
  const day = date.getDay();

  date.setDate(
    date.getDate() - day
  );

  return formatDate_(date);
}


function addDaysToDateString_(dateString, amount) {
  const date = parseDate_(dateString);

  date.setDate(
    date.getDate() + amount
  );

  return formatDate_(date);
}


/* =========================================================
   INITIAL DATE RANGE
   ========================================================= */

function ensureDayRange_(sheet, pastDays, futureDays) {
  const timezone = Session.getScriptTimeZone();

  const today = new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const existing = new Set();

  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    const date = formatDate_(values[i][0]);

    if (date) {
      existing.add(date);
    }
  }

  const missing = [];

  for (
    let offset = -pastDays;
    offset <= futureDays;
    offset++
  ) {
    const date = new Date(today);

    date.setDate(
      today.getDate() + offset
    );

    const key = Utilities.formatDate(
      date,
      timezone,
      'yyyy-MM-dd'
    );

    if (!existing.has(key)) {
      missing.push([
        date,
        '',
        ''
      ]);
    }
  }

  if (missing.length) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        missing.length,
        3
      )
      .setValues(missing);

    sheet
      .getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        3
      )
      .sort({
        column: 1,
        ascending: true
      });
  }
}


/* =========================================================
   SHEET HELPERS
   ========================================================= */

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);

    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([headers]);
  }

  return sheet;
}


function formatDate_(value) {
  if (!value) {
    return '';
  }

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]'
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd'
    );
  }

  const stringValue = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
  ) {
    return stringValue;
  }

  const date = new Date(value);

  if (isNaN(date)) {
    return stringValue;
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );
}


function parseDate_(dateString) {
  const parts = dateString
    .split('-')
    .map(Number);

  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2]
  );
}
