import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { boardsApi } from '../api/boards';
import { tasksApi } from '../api/tasks';
import { alert } from './AlertSystem';

function detectColumnType(values) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonEmpty.length === 0) return 'text';

  let numbers = 0, booleans = 0, dates = 0, urls = 0, emails = 0;

  for (const v of nonEmpty) {
    if (typeof v === 'number' || (!isNaN(Number(v)) && v !== '')) numbers++;
    if (typeof v === 'boolean' || v === 'true' || v === 'false' || v === 'yes' || v === 'no' || v === 'TRUE' || v === 'FALSE') booleans++;
    if (v instanceof Date || (!isNaN(Date.parse(v)) && typeof v === 'string' && v.length > 5 && /\d/.test(v) && (v.includes('/') || v.includes('-')))) dates++;
    if (typeof v === 'string' && /^https?:\/\//i.test(v)) urls++;
    if (typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) emails++;
  }

  const total = nonEmpty.length;
  if (emails / total > 0.7) return 'email';
  if (urls / total > 0.7) return 'url';
  if (booleans / total > 0.7) return 'checkbox';
  if (dates / total > 0.6) return 'date';
  if (numbers / total > 0.7) return 'number';

  const unique = new Set(nonEmpty.map(v => String(v).trim()));
  if (unique.size <= 10 && unique.size < total * 0.5 && total >= 4) return 'dropdown';

  return 'text';
}

function getUniqueOptions(values) {
  const unique = [...new Set(values.filter(v => v !== null && v !== undefined && v !== '').map(v => String(v).trim()))];
  return unique.sort();
}

export default function ImportSpreadsheet({ onImported, existingBoardId }) {
  const fileRef = useRef();
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [columnConfig, setColumnConfig] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [boardTitle, setBoardTitle] = useState('');
  const [importMode] = useState(existingBoardId ? 'existing' : 'new');
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const parseFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        setSheets(workbook.SheetNames);
        setFileName(file.name);
        setBoardTitle(file.name.replace(/\.(xlsx|xls|csv)$/i, ''));

        loadSheet(workbook, 0);
        setStep('preview');
      } catch (err) {
        alert.error('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const loadSheet = (workbook, idx) => {
    const sheetName = workbook.SheetNames[idx];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (json.length < 2) {
      alert.error('Sheet needs at least a header row and one data row');
      return;
    }

    const rawHdrs = json[0].map(h => String(h ?? '').trim());
    const hdrs = rawHdrs.map((name, colIdx) => (name ? name : `Column ${colIdx + 1}`));
    const dataRows = json.slice(1).filter(row => row.some(cell => cell !== ''));

    setHeaders(hdrs);
    setRows(dataRows);
    setSelectedSheet(idx);

    const config = hdrs.map((name, colIdx) => {
      const colValues = dataRows.map(row => row[colIdx]);
      const detectedType = detectColumnType(colValues);
      const options = detectedType === 'dropdown' ? getUniqueOptions(colValues) : [];

      const lower = name.toLowerCase();
      let mapping = 'custom';
      if (lower === 'title' || lower === 'name' || lower === 'task' || lower === 'task name') mapping = 'title';
      else if (lower === 'description' || lower === 'desc' || lower === 'details') mapping = 'description';
      else if (lower === 'status') mapping = 'status';
      else if (lower === 'priority') mapping = 'priority';
      else if (lower === 'due date' || lower === 'duedate' || lower === 'due' || lower === 'deadline') mapping = 'dueDate';

      return {
        name,
        originalIndex: colIdx,
        type: detectedType,
        options,
        mapping,
        include: true,
      };
    });

    setColumnConfig(config);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) parseFile(file);
  };

  const updateColConfig = (idx, updates) => {
    setColumnConfig(prev => {
      const newConfig = [...prev];
      if (updates.mapping && !['custom', 'skip'].includes(updates.mapping)) {
        newConfig.forEach((c, i) => {
          if (i !== idx && c.mapping === updates.mapping) {
            newConfig[i] = { ...c, mapping: 'custom' };
          }
        });
      }
      newConfig[idx] = { ...newConfig[idx], ...updates };
      return newConfig;
    });
  };

  const handleImport = async () => {
    const titleCol = columnConfig.find(c => c.mapping === 'title');
    if (!titleCol) {
      alert.error('Please map at least one column as "Title"');
      return;
    }

    setImporting(true);
    setProgress({ done: 0, total: rows.length });

    // Show persistent loading toast
    const toastId = alert.info(`Importing ${rows.length} tasks... This may take a moment.`);

    try {
      const customCols = columnConfig.filter(c => c.mapping === 'custom' && c.include);
      const boardColumnName = (c) => {
        const n = (c.name || '').trim();
        return n || `Field ${c.originalIndex + 1}`;
      };
      const boardColumns = customCols.map(c => ({
        name: boardColumnName(c),
        type: c.type,
        options: c.options.length > 0 ? c.options : undefined,
      }));

      let boardId = existingBoardId;

      if (importMode === 'new') {
        const createRes = await boardsApi.create({
          title: boardTitle || fileName,
          description: `Imported from ${fileName}`,
          columns: boardColumns,
        });
        boardId = createRes.data._id;
      } else if (customCols.length > 0) {
        // Fetch existing board to check for duplicate columns
        const existingRes = await boardsApi.getOne(boardId);
        const existingColNames = new Set(existingRes.data.columns.map(c => c.name));

        // Only add columns that don't already exist
        for (const col of boardColumns) {
          if (!col.name?.trim()) continue;
          if (!existingColNames.has(col.name)) {
            await boardsApi.addColumn(boardId, col);
          }
        }
      }

      // Get updated board to get column IDs
      const fetchRes = await boardsApi.getOne(boardId);
      const board = fetchRes.data;

      // Map column names to IDs (use first match to avoid duplicates)
      const colNameToId = {};
      for (const col of board.columns) {
        if (!colNameToId[col.name]) {
          colNameToId[col.name] = col._id;
        }
      }

      let created = 0;
      let failed = 0;
      const descCol = columnConfig.find(c => c.mapping === 'description');
      const statusCol = columnConfig.find(c => c.mapping === 'status');
      const priorityCol = columnConfig.find(c => c.mapping === 'priority');
      const dueDateCol = columnConfig.find(c => c.mapping === 'dueDate');

      // Process in batches for better UX
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const title = String(row[titleCol.originalIndex] || '').trim();
        if (!title) {
          setProgress(p => ({ ...p, done: p.done + 1 }));
          continue;
        }

        const taskData = { title };

        if (descCol) taskData.description = String(row[descCol.originalIndex] || '');

        if (statusCol) {
          const raw = String(row[statusCol.originalIndex] || '').toLowerCase().replace(/\s+/g, '_');
          const valid = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
          taskData.status = valid.includes(raw) ? raw : 'pending';
        }

        if (priorityCol) {
          const raw = String(row[priorityCol.originalIndex] || '').toLowerCase();
          const valid = ['low', 'medium', 'high', 'critical'];
          taskData.priority = valid.includes(raw) ? raw : 'medium';
        }

        if (dueDateCol) {
          const raw = row[dueDateCol.originalIndex];
          if (raw) {
            const d = raw instanceof Date ? raw : new Date(raw);
            if (!isNaN(d.getTime())) taskData.dueDate = d.toISOString();
          }
        }

        const columnValues = {};
        for (const col of customCols) {
          const boardColName = (col.name || '').trim() || `Field ${col.originalIndex + 1}`;
          const colId = colNameToId[boardColName];
          if (!colId) continue;
          let val = row[col.originalIndex];
          if (val === '' || val === undefined || val === null) continue;

          if (col.type === 'number') val = Number(val) || 0;
          if (col.type === 'checkbox') val = val === true || val === 'true' || val === 'yes' || val === 'TRUE' || val === 'Yes';
          if (col.type === 'date' && val instanceof Date) val = val.toISOString();

          columnValues[colId] = val;
        }

        if (Object.keys(columnValues).length > 0) {
          taskData.columnValues = columnValues;
        }

        try {
          await tasksApi.create(boardId, taskData, { headers: { 'x-import': 'true' } });
          created++;
        } catch {
          failed++;
        }

        setProgress({ done: i + 1, total: rows.length });

        // Update toast progress every 5 rows
        if ((i + 1) % 5 === 0 || i === rows.length - 1) {
          alert.info(`Importing... ${i + 1}/${rows.length} rows processed`, { id: toastId });
        }
      }

      alert.success(
        `Import complete! ${created} tasks created${failed > 0 ? `, ${failed} failed` : ''}`,
        { id: toastId, duration: 4000 }
      );
      onImported(boardId);
    } catch (err) {
      alert.error('Import failed: ' + (err.response?.data?.error || err.message), { id: toastId });
    } finally {
      setImporting(false);
    }
  };

  if (step === 'upload') {
    return (
      <div
        className={`import-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
        />
        <div className="import-zone-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <h4>Drop spreadsheet here or click to browse</h4>
        <p>Supports .xlsx, .xls, and .csv files</p>
      </div>
    );
  }

  const hasTitleMapping = columnConfig.some(c => c.mapping === 'title');

  return (
    <div>
      {/* File info bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--green-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--green)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8" fill="none" stroke="var(--green)" strokeWidth="2"/></svg>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{fileName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{rows.length} rows, {headers.length} columns</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setStep('upload'); setHeaders([]); setRows([]); }} disabled={importing}>Change file</button>
      </div>

      {/* Sheet selector */}
      {sheets.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {sheets.map((s, i) => (
            <button
              key={s}
              className={`filter-pill ${selectedSheet === i ? 'active' : ''}`}
              onClick={() => setSelectedSheet(i)}
              disabled={importing}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Import mode */}
      {!existingBoardId && (
        <div className="form-group">
          <label className="form-label">Project Name</label>
          <input type="text" className="form-input" value={boardTitle} onChange={e => setBoardTitle(e.target.value)} placeholder="Name for the new project" disabled={importing} />
        </div>
      )}

      {/* Title mapping warning with quick-pick buttons */}
      {!hasTitleMapping && (
        <div style={{ padding: '12px 14px', background: 'var(--orange-subtle)', border: '1px solid rgba(255, 159, 10, 0.2)', borderRadius: 'var(--radius-sm)', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 550, marginBottom: 8 }}>
            Select which column contains your task titles:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {columnConfig.filter(c => c.include).map((col, i) => (
              <button
                key={col.originalIndex}
                className="btn btn-xs"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
                onClick={() => {
                  const idx = columnConfig.findIndex(c => c.originalIndex === col.originalIndex);
                  updateColConfig(idx, { mapping: 'title' });
                }}
              >
                {col.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Column mapping */}
      <div style={{ fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: 10, marginTop: 16 }}>
        Column Mapping
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 14px', textAlign: 'left', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-tertiary)' }}>Column</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-tertiary)' }}>Map To</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-tertiary)' }}>Type</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-tertiary)' }}>Sample</th>
            </tr>
          </thead>
          <tbody>
            {columnConfig.map((col, idx) => (
              <tr key={idx} style={{ opacity: !col.include ? 0.4 : 1 }}>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--separator)', fontWeight: 500 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={col.include} onChange={e => updateColConfig(idx, { include: e.target.checked })} style={{ accentColor: 'var(--accent)' }} disabled={importing} />
                    {col.name}
                  </label>
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--separator)' }}>
                  <select
                    className="column-type-select"
                    value={col.mapping}
                    onChange={e => updateColConfig(idx, { mapping: e.target.value })}
                    disabled={!col.include || importing}
                  >
                    <option value="custom">Custom Column</option>
                    <option value="title">Title</option>
                    <option value="description">Description</option>
                    <option value="status">Status</option>
                    <option value="priority">Priority</option>
                    <option value="dueDate">Due Date</option>
                    <option value="skip">Skip</option>
                  </select>
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--separator)' }}>
                  {col.mapping === 'custom' ? (
                    <select
                      className="column-type-select"
                      value={col.type}
                      onChange={e => updateColConfig(idx, { type: e.target.value })}
                      disabled={!col.include || importing}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="dropdown">Dropdown</option>
                      <option value="date">Date</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="url">URL</option>
                      <option value="email">Email</option>
                      <option value="tag">Tag</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Built-in</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--separator)', color: 'var(--text-secondary)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rows[0]?.[col.originalIndex] !== undefined ? String(rows[0][col.originalIndex]) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div style={{ fontSize: 12, fontWeight: 650, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        Data Preview (first 5 rows)
      </div>
      <div className="import-preview" style={{ marginBottom: 20, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row, i) => (
              <tr key={i}>
                {headers.map((_, j) => (
                  <td key={j}>{row[j] !== undefined ? String(row[j]) : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Progress bar during import */}
      {importing && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            <span>Importing tasks...</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <div style={{ width: '100%', height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
              height: '100%',
              background: 'var(--accent)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Import button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-secondary" onClick={() => { setStep('upload'); setHeaders([]); setRows([]); }} disabled={importing}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={handleImport}
          disabled={importing || !hasTitleMapping}
        >
          {importing ? `Importing... ${progress.done}/${progress.total}` : `Import ${rows.length} Tasks`}
        </button>
      </div>
    </div>
  );
}
