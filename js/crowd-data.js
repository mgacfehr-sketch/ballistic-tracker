/**
 * crowd-data.js — Admin-only Crowd Data Warehouse.
 *
 * Organizes anonymized velocity strings + associated group/session
 * data across ALL users into a sortable, filterable table with
 * one-click CSV / XLSX export. Organization and export only — no
 * analysis or charts (that happens externally).
 *
 * Data comes from the crowd_get_data() RPC, which enforces the
 * admin check SERVER-SIDE (raises for non-admins) and replaces
 * user ids with opaque salted shooter keys.
 *
 * XLSX export uses SheetJS (already loaded from CDN for the Garmin
 * import); CSV export has no dependencies.
 */

var CROWD_BLANK = '__blank__';

// Column registry: key matches the RPC's JSON keys (snake_case).
// filter:true gets a distinct-value dropdown. type drives sorting.
var CROWD_COLUMNS = [
    { key: 'shooter_key',      label: 'Shooter',           type: 'text', filter: true },
    { key: 'string_date',      label: 'String Date',       type: 'date' },
    { key: 'caliber',          label: 'Caliber',           type: 'text', filter: true },
    { key: 'barrel_spec',      label: 'Barrel Spec',       type: 'text', filter: true },
    { key: 'twist_rate',       label: 'Twist',             type: 'text', filter: true },
    { key: 'twist_direction',  label: 'Twist Dir',         type: 'text' },
    { key: 'muzzle_device',    label: 'Muzzle Device',     type: 'text', filter: true },
    { key: 'load_name',        label: 'Load / Ammo',       type: 'text', filter: true },
    { key: 'bullet_name',      label: 'Bullet',            type: 'text', filter: true },
    { key: 'bullet_weight',    label: 'Bullet Wt (gr)',    type: 'num' },
    { key: 'bullet_diameter',  label: 'Bullet Dia (in)',   type: 'num' },
    { key: 'bullet_bc',        label: 'BC',                type: 'num' },
    { key: 'drag_model',       label: 'Drag',              type: 'text' },
    { key: 'nominal_velocity', label: 'Nominal MV (fps)',  type: 'num' },
    { key: 'avg_fps',          label: 'Avg (fps)',         type: 'num' },
    { key: 'sd_fps',           label: 'SD (fps)',          type: 'num' },
    { key: 'es_fps',           label: 'ES (fps)',          type: 'num' },
    { key: 'shot_count',       label: 'Shots',             type: 'num' },
    { key: 'shot_velocities',  label: 'Per-Shot (fps)',    type: 'text', truncate: 24 },
    { key: 'round_count_at',   label: 'Rounds @',          type: 'num' },
    { key: 'source',           label: 'Source',            type: 'text' },
    { key: 'session_date',     label: 'Session Date',      type: 'date' },
    { key: 'distance_yards',   label: 'Distance (yd)',     type: 'num' },
    { key: 'rounds_fired',     label: 'Rounds Fired',      type: 'num' },
    { key: 'session_measured_velocity', label: 'Session MV (fps)', type: 'num' },
    { key: 'group_size_inches', label: 'Group (in)',       type: 'num' },
    { key: 'group_size_moa',   label: 'Group (MOA)',       type: 'num' },
    { key: 'mean_radius_inches', label: 'Mean Rad (in)',   type: 'num' },
    { key: 'mean_radius_moa',  label: 'Mean Rad (MOA)',    type: 'num' },
    { key: 'temp_f',           label: 'Temp (F)',          type: 'num' },
    { key: 'humidity_pct',     label: 'Humidity (%)',      type: 'num' },
    { key: 'wind_mph',         label: 'Wind (mph)',        type: 'num' },
    { key: 'wind_dir',         label: 'Wind Dir',          type: 'text' },
    { key: 'altitude_ft',      label: 'Altitude (ft)',     type: 'num' },
    { key: 'pressure_in_hg',   label: 'Pressure (inHg)',   type: 'num' },
    { key: 'string_id',        label: 'String ID',         type: 'text', truncate: 8 },
    { key: 'session_id',       label: 'Session ID',        type: 'text', truncate: 8 }
];

// ── Pure helpers (no DOM — unit-tested in tests/test-crowd-data.js) ──

function crowdIsBlank(val) {
    return val === null || val === undefined || val === '';
}

/** Escape one CSV field per RFC 4180. */
function crowdCsvEscape(val) {
    if (crowdIsBlank(val)) return '';
    var s = String(val);
    if (/[",\r\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/** Build a full CSV string (CRLF rows, snake_case keys as header). */
function crowdBuildCsv(columns, rows) {
    var lines = [columns.map(function (c) { return crowdCsvEscape(c.key); }).join(',')];
    for (var i = 0; i < rows.length; i++) {
        var cells = [];
        for (var j = 0; j < columns.length; j++) {
            cells.push(crowdCsvEscape(rows[i][columns[j].key]));
        }
        lines.push(cells.join(','));
    }
    return lines.join('\r\n') + '\r\n';
}

/**
 * Apply column filters + global text search.
 * filters: { columnKey: value } — value CROWD_BLANK matches blank cells.
 * search: case-insensitive substring across all column values.
 */
function crowdApplyFilters(rows, filters, search) {
    var keys = [];
    for (var k in filters) {
        if (filters.hasOwnProperty(k) && filters[k] !== '' && filters[k] !== undefined) keys.push(k);
    }
    var needle = (search || '').toLowerCase().trim();

    return rows.filter(function (row) {
        for (var i = 0; i < keys.length; i++) {
            var want = filters[keys[i]];
            var val = row[keys[i]];
            if (want === CROWD_BLANK) {
                if (!crowdIsBlank(val)) return false;
            } else if (crowdIsBlank(val) || String(val) !== String(want)) {
                return false;
            }
        }
        if (needle) {
            var hit = false;
            for (var j = 0; j < CROWD_COLUMNS.length; j++) {
                var v = row[CROWD_COLUMNS[j].key];
                if (!crowdIsBlank(v) && String(v).toLowerCase().indexOf(needle) !== -1) {
                    hit = true;
                    break;
                }
            }
            if (!hit) return false;
        }
        return true;
    });
}

/** Sort a COPY of rows by column key. Blanks always sort last. */
function crowdSortRows(rows, key, dir, type) {
    var mult = dir === 'desc' ? -1 : 1;
    return rows.slice().sort(function (a, b) {
        var av = a[key];
        var bv = b[key];
        var aBlank = crowdIsBlank(av);
        var bBlank = crowdIsBlank(bv);
        if (aBlank && bBlank) return 0;
        if (aBlank) return 1;   // blanks last regardless of direction
        if (bBlank) return -1;
        if (type === 'num') {
            var an = parseFloat(av);
            var bn = parseFloat(bv);
            if (isNaN(an) && isNaN(bn)) return 0;
            if (isNaN(an)) return 1;
            if (isNaN(bn)) return -1;
            return (an - bn) * mult;
        }
        // dates are ISO strings — lexicographic order is chronological
        var as = String(av).toLowerCase();
        var bs = String(bv).toLowerCase();
        if (as < bs) return -1 * mult;
        if (as > bs) return 1 * mult;
        return 0;
    });
}

/** Format a value for table display (export always uses raw values). */
function crowdFormatCell(val, col) {
    if (crowdIsBlank(val)) return '';
    var s = String(val);
    if (col.type === 'date') return s.split('T')[0];
    if (col.truncate && s.length > col.truncate) return s.slice(0, col.truncate) + '…';
    return s;
}

/** Distinct non-blank values of one column, sorted; plus blank flag. */
function crowdDistinctValues(rows, key) {
    var seen = {};
    var values = [];
    var hasBlank = false;
    for (var i = 0; i < rows.length; i++) {
        var v = rows[i][key];
        if (crowdIsBlank(v)) { hasBlank = true; continue; }
        var s = String(v);
        if (!seen[s]) { seen[s] = true; values.push(s); }
    }
    values.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
    return { values: values, hasBlank: hasBlank };
}

// ── Manager (DOM) ──────────────────────────────────────────────

function CrowdDataManager(db) {
    this.db = db;
    this.rows = null;        // full dataset from the RPC
    this.filters = {};       // columnKey -> selected value ('' = all)
    this.search = '';
    this.sortKey = 'string_date';
    this.sortDir = 'desc';
    this.container = null;
    this.onBack = null;
}

/** Render into a container (the admin content area). onBack returns to the dashboard. */
CrowdDataManager.prototype.show = function (container, onBack) {
    var self = this;
    self.container = container;
    self.onBack = onBack || null;
    if (!container) return;

    container.className = '';
    container.innerHTML = '<div class="admin-loading">Loading crowd data…</div>';

    self.db.crowdGetData().then(function (rows) {
        self.rows = rows || [];
        self._renderShell();
    }).catch(function (err) {
        container.innerHTML =
            '<div class="admin-error">Failed to load crowd data: ' + self._esc(err.message) + '</div>' +
            '<button class="btn btn-secondary" id="crowd-back-err">Back to Dashboard</button>';
        var backBtn = document.getElementById('crowd-back-err');
        if (backBtn && self.onBack) backBtn.addEventListener('click', self.onBack);
    });
};

CrowdDataManager.prototype._visibleRows = function () {
    var filtered = crowdApplyFilters(this.rows || [], this.filters, this.search);
    var col = this._column(this.sortKey);
    return crowdSortRows(filtered, this.sortKey, this.sortDir, col ? col.type : 'text');
};

CrowdDataManager.prototype._column = function (key) {
    for (var i = 0; i < CROWD_COLUMNS.length; i++) {
        if (CROWD_COLUMNS[i].key === key) return CROWD_COLUMNS[i];
    }
    return null;
};

CrowdDataManager.prototype._renderShell = function () {
    var self = this;
    var html = '';

    html += '<section class="admin-section crowd-section">';
    html += '<div class="crowd-toolbar">';
    html += '<button class="btn btn-secondary btn-sm" id="crowd-back">&larr; Dashboard</button>';
    html += '<h3 class="admin-section-title crowd-title">Crowd Data Warehouse</h3>';
    html += '<button class="btn btn-secondary btn-sm" id="crowd-refresh">Refresh</button>';
    html += '</div>';
    html += '<p class="admin-desc">Anonymized velocity strings across all users, joined with rifle/barrel/load specs and same-trip group data. Filter, then export for external analysis.</p>';

    // Export buttons
    html += '<div class="crowd-export-row">';
    html += '<button class="btn btn-primary btn-sm" id="crowd-csv-filtered">CSV (filtered)</button>';
    html += '<button class="btn btn-primary btn-sm" id="crowd-xlsx-filtered">XLSX (filtered)</button>';
    html += '<button class="btn btn-secondary btn-sm" id="crowd-csv-all">CSV (all)</button>';
    html += '<button class="btn btn-secondary btn-sm" id="crowd-xlsx-all">XLSX (all)</button>';
    html += '</div>';

    // Filters
    html += '<div class="crowd-filters" id="crowd-filters">';
    for (var i = 0; i < CROWD_COLUMNS.length; i++) {
        var col = CROWD_COLUMNS[i];
        if (!col.filter) continue;
        html += '<label class="crowd-filter">';
        html += '<span class="crowd-filter-label">' + self._esc(col.label) + '</span>';
        html += '<select data-filter-key="' + col.key + '">' + self._filterOptions(col.key) + '</select>';
        html += '</label>';
    }
    html += '<label class="crowd-filter crowd-filter-search">';
    html += '<span class="crowd-filter-label">Search</span>';
    html += '<input type="text" id="crowd-search" placeholder="Any column…">';
    html += '</label>';
    html += '<button class="btn btn-secondary btn-sm" id="crowd-clear-filters">Clear</button>';
    html += '</div>';

    html += '<p class="crowd-count" id="crowd-count"></p>';

    // Table
    html += '<div class="admin-table-wrap crowd-table-wrap">';
    html += '<table class="admin-table crowd-table">';
    html += '<thead><tr>';
    for (var h = 0; h < CROWD_COLUMNS.length; h++) {
        html += '<th class="crowd-th" data-sort-key="' + CROWD_COLUMNS[h].key + '">' +
            self._esc(CROWD_COLUMNS[h].label) + '<span class="crowd-sort-ind"></span></th>';
    }
    html += '</tr></thead>';
    html += '<tbody id="crowd-tbody"></tbody>';
    html += '</table></div>';
    html += '</section>';

    self.container.innerHTML = html;
    self._bindShell();
    self._renderBody();
};

CrowdDataManager.prototype._filterOptions = function (key) {
    var self = this;
    var distinct = crowdDistinctValues(self.rows || [], key);
    var current = self.filters[key] || '';
    var html = '<option value="">All</option>';
    if (distinct.hasBlank) {
        html += '<option value="' + CROWD_BLANK + '"' + (current === CROWD_BLANK ? ' selected' : '') + '>(blank)</option>';
    }
    for (var i = 0; i < distinct.values.length; i++) {
        var v = distinct.values[i];
        html += '<option value="' + self._escAttr(v) + '"' + (current === v ? ' selected' : '') + '>' +
            self._esc(v) + '</option>';
    }
    return html;
};

CrowdDataManager.prototype._bindShell = function () {
    var self = this;

    var back = document.getElementById('crowd-back');
    if (back) back.addEventListener('click', function () {
        if (self.onBack) self.onBack();
    });

    var refresh = document.getElementById('crowd-refresh');
    if (refresh) refresh.addEventListener('click', function () {
        self.rows = null;
        self.show(self.container, self.onBack);
    });

    var filterEls = self.container.querySelectorAll('#crowd-filters select[data-filter-key]');
    for (var i = 0; i < filterEls.length; i++) {
        filterEls[i].addEventListener('change', function () {
            self.filters[this.getAttribute('data-filter-key')] = this.value;
            self._renderBody();
        });
    }

    var search = document.getElementById('crowd-search');
    if (search) search.addEventListener('input', function () {
        self.search = this.value;
        self._renderBody();
    });

    var clear = document.getElementById('crowd-clear-filters');
    if (clear) clear.addEventListener('click', function () {
        self.filters = {};
        self.search = '';
        var sel = self.container.querySelectorAll('#crowd-filters select[data-filter-key]');
        for (var j = 0; j < sel.length; j++) sel[j].value = '';
        var si = document.getElementById('crowd-search');
        if (si) si.value = '';
        self._renderBody();
    });

    var ths = self.container.querySelectorAll('.crowd-th');
    for (var t = 0; t < ths.length; t++) {
        ths[t].addEventListener('click', function () {
            var key = this.getAttribute('data-sort-key');
            if (self.sortKey === key) {
                self.sortDir = self.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                self.sortKey = key;
                var col = self._column(key);
                self.sortDir = (col && (col.type === 'num' || col.type === 'date')) ? 'desc' : 'asc';
            }
            self._renderBody();
        });
    }

    self._bindExport('crowd-csv-filtered', 'csv', false);
    self._bindExport('crowd-xlsx-filtered', 'xlsx', false);
    self._bindExport('crowd-csv-all', 'csv', true);
    self._bindExport('crowd-xlsx-all', 'xlsx', true);
};

CrowdDataManager.prototype._bindExport = function (id, format, all) {
    var self = this;
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function () {
        var rows = all ? (self.rows || []) : self._visibleRows();
        if (rows.length === 0) {
            alert('No rows to export.');
            return;
        }
        if (format === 'csv') self._exportCsv(rows, all);
        else self._exportXlsx(rows, all);
    });
};

CrowdDataManager.prototype._renderBody = function () {
    var self = this;
    var rows = self._visibleRows();

    var countEl = document.getElementById('crowd-count');
    if (countEl) {
        countEl.textContent = rows.length + ' of ' + (self.rows ? self.rows.length : 0) +
            ' rows (one row per velocity string × matched session)';
    }

    // Sort indicators
    var ths = self.container.querySelectorAll('.crowd-th');
    for (var t = 0; t < ths.length; t++) {
        var ind = ths[t].querySelector('.crowd-sort-ind');
        if (!ind) continue;
        if (ths[t].getAttribute('data-sort-key') === self.sortKey) {
            ind.textContent = self.sortDir === 'asc' ? ' ▲' : ' ▼';
        } else {
            ind.textContent = '';
        }
    }

    var body = '';
    for (var i = 0; i < rows.length; i++) {
        body += '<tr>';
        for (var j = 0; j < CROWD_COLUMNS.length; j++) {
            var col = CROWD_COLUMNS[j];
            var raw = rows[i][col.key];
            var shown = crowdFormatCell(raw, col);
            var title = (col.truncate && !crowdIsBlank(raw) && String(raw).length > col.truncate)
                ? ' title="' + self._escAttr(String(raw)) + '"' : '';
            body += '<td' + title + '>' + self._esc(shown) + '</td>';
        }
        body += '</tr>';
    }
    if (rows.length === 0) {
        body = '<tr><td colspan="' + CROWD_COLUMNS.length + '" class="crowd-empty">No rows match the current filters.</td></tr>';
    }

    var tbody = document.getElementById('crowd-tbody');
    if (tbody) tbody.innerHTML = body;
};

// ── Export ────────────────────────────────────────────────────

CrowdDataManager.prototype._exportCsv = function (rows, all) {
    var csv = crowdBuildCsv(CROWD_COLUMNS, rows);
    // UTF-8 BOM so Excel opens it with correct encoding
    var blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    this._download(blob, this._fileName(all, 'csv'));
};

CrowdDataManager.prototype._exportXlsx = function (rows, all) {
    if (typeof XLSX === 'undefined') {
        alert('XLSX library not loaded (offline or CDN blocked). Use CSV export instead.');
        return;
    }
    var aoa = [CROWD_COLUMNS.map(function (c) { return c.key; })];
    for (var i = 0; i < rows.length; i++) {
        var line = [];
        for (var j = 0; j < CROWD_COLUMNS.length; j++) {
            var v = rows[i][CROWD_COLUMNS[j].key];
            line.push(crowdIsBlank(v) ? null : v);
        }
        aoa.push(line);
    }
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CrowdData');
    XLSX.writeFile(wb, this._fileName(all, 'xlsx'));
};

CrowdDataManager.prototype._fileName = function (all, ext) {
    var now = new Date();
    var ts = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
    return 'yort-crowd-data-' + (all ? 'all' : 'filtered') + '-' + ts + '.' + ext;
};

CrowdDataManager.prototype._download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// ── Escaping ──────────────────────────────────────────────────

CrowdDataManager.prototype._esc = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

CrowdDataManager.prototype._escAttr = function (str) {
    return this._esc(str);
};

// Export pure helpers for node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CROWD_COLUMNS: CROWD_COLUMNS,
        CROWD_BLANK: CROWD_BLANK,
        crowdIsBlank: crowdIsBlank,
        crowdCsvEscape: crowdCsvEscape,
        crowdBuildCsv: crowdBuildCsv,
        crowdApplyFilters: crowdApplyFilters,
        crowdSortRows: crowdSortRows,
        crowdFormatCell: crowdFormatCell,
        crowdDistinctValues: crowdDistinctValues
    };
}
