/* =========================================================
   parser.js — lee el Excel de pedidos y lo normaliza
   ========================================================= */
(function (global) {
  'use strict';

  /* Sinónimos aceptados para cada columna (en minúsculas, sin acentos) */
  const COLUMN_ALIASES = {
    id:       ['id', 'pedido', 'nro', 'nro pedido', 'numero', 'n pedido', 'order', 'order id', 'orden'],
    channel:  ['channel', 'canal', 'origen'],
    name:     ['commensal', 'comensal', 'nombre', 'name', 'cliente', 'alumno', 'student', 'nombre y apellido'],
    klass:    ['class', 'clase', 'curso', 'grupo', 'grado', 'salon', 'salon/clase'],
    time:     ['pick-up time', 'pickup time', 'pick up time', 'hora', 'horario', 'time', 'hora de retiro', 'hora retiro'],
    products: ['products', 'productos', 'product', 'producto', 'items', 'articulos', 'detalle', 'pedido detalle'],
    comments: ['comments', 'comentarios', 'comment', 'observaciones', 'observacion', 'notas', 'notes'],
    status:   ['status', 'estado']
  };

  /* Etiquetas de las filas de metadatos que van arriba del encabezado */
  const META_ALIASES = {
    date:   ['pick-up date', 'pickup date', 'fecha', 'fecha de retiro', 'fecha retiro'],
    export: ['export date', 'fecha de exportacion', 'exportado'],
    status: ['status', 'estado'],
    total:  ['total orders', 'total pedidos', 'total']
  };

  function norm(v) {
    return String(v == null ? '' : v)
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** minúsculas, sin acentos, sin puntuación de borde: para comparar encabezados */
  function key(v) {
    return norm(v)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[:.]+$/, '')
      .trim();
  }

  /* ---------- fila de encabezado ---------- */

  function matchField(cellKey) {
    for (const field in COLUMN_ALIASES) {
      if (COLUMN_ALIASES[field].indexOf(cellKey) !== -1) return field;
    }
    return null;
  }

  function findHeaderRow(rows) {
    let best = null;
    const limit = Math.min(rows.length, 40);
    for (let r = 0; r < limit; r++) {
      const map = {};
      let hits = 0;
      (rows[r] || []).forEach(function (cell, c) {
        const f = matchField(key(cell));
        if (f && map[f] === undefined) { map[f] = c; hits++; }
      });
      // hace falta al menos el nombre y algo más, o productos y algo más
      const usable = (map.name !== undefined || map.products !== undefined) && hits >= 2;
      if (usable && (!best || hits > best.hits)) best = { row: r, map: map, hits: hits };
    }
    return best;
  }

  /* ---------- metadatos de las filas superiores ---------- */

  function readMeta(rows, headerRow) {
    const meta = {};
    for (let r = 0; r < headerRow; r++) {
      const cells = (rows[r] || []).map(norm).filter(Boolean);
      if (!cells.length) continue;
      const line = cells.join(' ');
      const m = /^([^:]{2,40}):\s*(.+)$/.exec(line);
      if (!m) {
        if (!meta.title) meta.title = line;
        continue;
      }
      const label = key(m[1]);
      const value = norm(m[2]);
      for (const f in META_ALIASES) {
        if (META_ALIASES[f].indexOf(label) !== -1 && !meta[f]) meta[f] = value;
      }
    }
    return meta;
  }

  /* ---------- clase → nivel + división ---------- */

  function splitClass(raw) {
    const t = norm(raw);
    if (!t) return { klass: '', level: 'Sin clase', division: '' };
    const m = /^(.*?)\s*[-–—]\s*(.+)$/.exec(t);
    if (m) {
      const level = norm(m[1]);
      const division = norm(m[2]);
      return { klass: level + ' - ' + division, level: level, division: division };
    }
    return { klass: t, level: t, division: '' };
  }

  /* ---------- hora ---------- */

  function parseTime(raw) {
    if (raw == null || raw === '') return { time: '', minutes: 1e9 };
    if (raw instanceof Date) {
      const hh = String(raw.getHours()).padStart(2, '0');
      const mm = String(raw.getMinutes()).padStart(2, '0');
      return { time: hh + ':' + mm, minutes: raw.getHours() * 60 + raw.getMinutes() };
    }
    if (typeof raw === 'number' && raw >= 0 && raw < 1) {   // fracción de día de Excel
      const total = Math.round(raw * 24 * 60);
      const hh = String(Math.floor(total / 60)).padStart(2, '0');
      const mm = String(total % 60).padStart(2, '0');
      return { time: hh + ':' + mm, minutes: total };
    }
    const t = norm(raw);
    const m = /(\d{1,2})[:.h](\d{2})/.exec(t);
    if (m) {
      const hh = String(Math.min(23, +m[1])).padStart(2, '0');
      const mm = m[2];
      return { time: hh + ':' + mm, minutes: (+m[1]) * 60 + (+mm) };
    }
    return { time: t, minutes: 1e9 };
  }

  /* ---------- productos ---------- */

  function cleanProductName(s) {
    return norm(s)
      .replace(/\s*[\/|,;·-]\s*$/, '')   // basura al final ("… ensalada / ")
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function parseProducts(raw) {
    const text = String(raw == null ? '' : raw);
    const lines = text.split(/\r?\n|·|•/).map(norm).filter(function (l) {
      return l && l !== '-' && l !== '—';
    });
    const items = [];
    lines.forEach(function (line) {
      const m = /^(\d+)\s*[x×*]\s*(.+)$/i.exec(line);
      if (m) {
        items.push({ qty: parseInt(m[1], 10) || 1, name: cleanProductName(m[2]) });
      } else {
        items.push({ qty: 1, name: cleanProductName(line) });
      }
    });
    return items.filter(function (i) { return i.name; });
  }

  function parseComment(raw) {
    const t = norm(raw);
    if (!t || t === '-' || t === '—' || t === '.' || key(t) === 'sin comentarios') return '';
    return t;
  }

  /* ---------- API ---------- */

  /**
   * @param {ArrayBuffer} buffer contenido del .xlsx / .xls / .csv
   * @returns {{orders:Array, meta:Object, columns:Object, warnings:Array<string>}}
   */
  function parseWorkbook(buffer) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (!wb.SheetNames.length) throw new Error('El archivo no tiene ninguna hoja.');

    let found = null;
    let rows = null;
    let sheetName = '';

    for (let i = 0; i < wb.SheetNames.length; i++) {
      const name = wb.SheetNames[i];
      const candidate = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1, raw: false, defval: '', blankrows: true
      });
      const header = findHeaderRow(candidate);
      if (header && (!found || header.hits > found.hits)) {
        found = header; rows = candidate; sheetName = name;
      }
    }

    if (!found) {
      throw new Error(
        'No encontré la fila de encabezados. Esperaba columnas tipo ' +
        '"Commensal / Nombre", "Class / Clase", "Pick-up time / Hora", "Products / Productos".'
      );
    }

    const map = found.map;
    const meta = readMeta(rows, found.row);
    meta.sheet = sheetName;

    const warnings = [];
    ['name', 'products', 'time', 'klass'].forEach(function (f) {
      if (map[f] === undefined) warnings.push('No encontré la columna «' + f + '»; los tickets van a salir sin ese dato.');
    });

    const cell = function (row, field) {
      const idx = map[field];
      return idx === undefined ? '' : (row[idx] == null ? '' : row[idx]);
    };

    const orders = [];
    let blankStreak = 0;

    for (let r = found.row + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const isBlank = row.every(function (c) { return norm(c) === ''; });
      if (isBlank) {
        blankStreak++;
        if (blankStreak >= 3) break;   // fin de la tabla
        continue;
      }
      blankStreak = 0;

      const name = norm(cell(row, 'name'));
      const products = cell(row, 'products');
      if (!name && !norm(products)) continue;

      const cls = splitClass(cell(row, 'klass'));
      const tm = parseTime(cell(row, 'time'));
      const items = parseProducts(products);

      orders.push({
        id: norm(cell(row, 'id')),
        channel: norm(cell(row, 'channel')),
        name: name || '(sin nombre)',
        klass: cls.klass,
        level: cls.level,
        division: cls.division,
        time: tm.time,
        minutes: tm.minutes,
        items: items,
        mainProduct: items.length ? items[0].name : '(sin producto)',
        units: items.reduce(function (a, i) { return a + i.qty; }, 0),
        comment: parseComment(cell(row, 'comments')),
        status: norm(cell(row, 'status')),
        row: r + 1
      });
    }

    if (!orders.length) throw new Error('Encontré los encabezados pero ninguna fila con pedidos.');

    return { orders: orders, meta: meta, columns: map, warnings: warnings };
  }

  global.Comandas = global.Comandas || {};
  global.Comandas.parseWorkbook = parseWorkbook;
  global.Comandas.norm = norm;

})(window);
