/* =========================================================
   render.js — arma las hojas A4 (tickets + resumen)
   ========================================================= */
(function (global) {
  'use strict';

  const LAYOUTS = {
    '2x2': { cols: 2, rows: 2 },
    '2x3': { cols: 2, rows: 3 },
    '2x4': { cols: 2, rows: 4 },
    '3x4': { cols: 3, rows: 4 }
  };

  const LEVEL_RANK = { 'kinder': 0, 'inicial': 0, 'jardin': 0, 'primaria': 1, 'secundaria': 2, 'liceo': 2 };

  /* ---------- helpers DOM (sin innerHTML: el contenido viene del Excel) ---------- */

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null && text !== '') n.textContent = text;
    return n;
  }

  function levelRank(name) {
    const k = String(name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const p in LEVEL_RANK) if (k.indexOf(p) === 0) return LEVEL_RANK[p];
    return 5;
  }

  const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

  /* ---------- agrupación ---------- */

  const GROUPERS = {
    nivel:    function (o) { return o.level || 'Sin clase'; },
    clase:    function (o) { return o.klass || 'Sin clase'; },
    hora:     function (o) { return o.time || 'Sin hora'; },
    producto: function (o) { return o.mainProduct || 'Sin producto'; },
    ninguno:  function () { return 'Todos los pedidos'; }
  };

  function groupOrders(orders, groupBy) {
    const fn = GROUPERS[groupBy] || GROUPERS.ninguno;
    const buckets = new Map();
    orders.forEach(function (o) {
      const label = fn(o);
      if (!buckets.has(label)) buckets.set(label, { label: label, orders: [], minutes: o.minutes });
      const g = buckets.get(label);
      g.orders.push(o);
      g.minutes = Math.min(g.minutes, o.minutes);
    });

    const groups = Array.from(buckets.values());

    if (groupBy === 'hora') {
      groups.sort(function (a, b) { return a.orders[0].minutes - b.orders[0].minutes; });
    } else if (groupBy === 'producto') {
      groups.sort(function (a, b) {
        return b.orders.length - a.orders.length || collator.compare(a.label, b.label);
      });
    } else if (groupBy === 'nivel' || groupBy === 'clase') {
      groups.sort(function (a, b) {
        return levelRank(a.label) - levelRank(b.label) || collator.compare(a.label, b.label);
      });
    }
    return groups;
  }

  const SORTERS = {
    hora:     function (a, b) { return a.minutes - b.minutes || collator.compare(a.name, b.name); },
    nombre:   function (a, b) { return collator.compare(a.name, b.name); },
    clase:    function (a, b) { return levelRank(a.level) - levelRank(b.level) || collator.compare(a.klass, b.klass) || collator.compare(a.name, b.name); },
    producto: function (a, b) { return collator.compare(a.mainProduct, b.mainProduct) || a.minutes - b.minutes; },
    id:       function (a, b) { return collator.compare(a.id, b.id); }
  };

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  /* ---------- ticket ---------- */

  function buildTicket(order, opts, index, total, groupLabel) {
    const tk = el('article', 'tk');

    const top = el('div', 'tk__top');
    top.appendChild(el('span', 'tk__group', order.klass || order.level || opts.title));
    top.appendChild(el('span', 'tk__time', order.time || '--:--'));
    tk.appendChild(top);

    tk.appendChild(el('div', 'tk__name', order.name));

    const meta = el('div', 'tk__meta');
    const left = el('span', null, null);
    left.appendChild(document.createTextNode('Nº '));
    left.appendChild(el('b', null, order.id || '—'));
    meta.appendChild(left);
    meta.appendChild(el('span', null, order.status || order.channel || ''));
    tk.appendChild(meta);

    const ul = el('ul', 'tk__items');
    (order.items.length ? order.items : [{ qty: 1, name: '(sin producto)' }]).forEach(function (it) {
      const li = el('li');
      li.appendChild(el('span', 'tk__qty', it.qty + '×'));
      li.appendChild(el('span', 'tk__pname', it.name));
      ul.appendChild(li);
    });
    tk.appendChild(ul);

    if (order.comment) {
      const note = el('div', 'tk__note');
      note.appendChild(el('b', null, 'Obs: '));
      note.appendChild(document.createTextNode(order.comment));
      tk.appendChild(note);
    }

    const foot = el('div', 'tk__foot');
    foot.appendChild(el('span', null, opts.date || ''));
    foot.appendChild(el('span', null, opts.groupBy === 'ninguno' ? (opts.title || '') : (groupLabel || '')));
    foot.appendChild(el('span', null, index + '/' + total));
    tk.appendChild(foot);

    return tk;
  }

  /* ---------- hoja ---------- */

  function buildSheet(opts, headLeft, headRight, layoutKey) {
    const sheet = el('section', 'sheet' + (opts.cutMarks ? '' : ' sheet--nocut'));

    const head = el('div', 'sheet__head');
    const l = el('div', null, null);
    l.appendChild(el('strong', null, opts.title || 'Comanda de cocina'));
    if (opts.date) l.appendChild(document.createTextNode('  ·  ' + opts.date));
    head.appendChild(l);

    const r = el('div', 'sheet__page', null);
    if (headLeft) r.appendChild(el('span', 'sheet__group', headLeft));
    if (headRight) {
      r.appendChild(document.createTextNode(headLeft ? '  ·  ' : ''));
      r.appendChild(document.createTextNode(headRight));
    }
    head.appendChild(r);
    sheet.appendChild(head);

    if (layoutKey) {
      const grid = el('div', 'sheet__grid g-' + layoutKey);
      sheet.appendChild(grid);
      sheet.__grid = grid;
    }
    return sheet;
  }

  /* ---------- resumen de producción ---------- */

  function buildSummaryRows(groups) {
    const rows = [];
    let totalUnits = 0, totalOrders = 0;

    groups.forEach(function (g) {
      const counts = new Map();
      g.orders.forEach(function (o) {
        o.items.forEach(function (it) {
          const k = it.name.toLowerCase();
          if (!counts.has(k)) counts.set(k, { name: it.name, qty: 0 });
          counts.get(k).qty += it.qty;
        });
      });
      const list = Array.from(counts.values()).sort(function (a, b) {
        return b.qty - a.qty || collator.compare(a.name, b.name);
      });
      const units = list.reduce(function (a, i) { return a + i.qty; }, 0);
      totalUnits += units;
      totalOrders += g.orders.length;

      rows.push({ type: 'group', label: g.label, qty: g.orders.length + ' ped.' });
      list.forEach(function (i) { rows.push({ type: 'item', label: i.name, qty: i.qty }); });
    });

    rows.push({ type: 'total', label: 'TOTAL — ' + totalOrders + ' pedidos', qty: totalUnits });
    return rows;
  }

  /** contenedor invisible para medir cuántas filas entran en una hoja */
  function measureHost() {
    let host = document.getElementById('__comandas_measure');
    if (!host) {
      host = document.createElement('div');
      host.id = '__comandas_measure';
      host.style.cssText = 'position:fixed;left:-10000px;top:0;width:230mm;visibility:hidden;pointer-events:none;';
      document.body.appendChild(host);
    }
    return host;
  }

  function totalsBlock(orders, groups) {
    const box = el('div', null);
    box.appendChild(el('h3', null, 'Totales'));

    const byTime = new Map();
    orders.forEach(function (o) {
      const k = o.time || 'Sin hora';
      byTime.set(k, (byTime.get(k) || 0) + 1);
    });
    const timeLine = Array.from(byTime.entries())
      .sort(function (a, b) { return collator.compare(a[0], b[0]); })
      .map(function (e) { return e[0] + ': ' + e[1]; }).join('   \u00b7   ');

    const table = el('table');
    const tbody = el('tbody');
    [
      ['Pedidos', String(orders.length)],
      ['Unidades (productos)', String(orders.reduce(function (a, o) { return a + o.units; }, 0))],
      ['Con observaciones', String(orders.filter(function (o) { return o.comment; }).length)],
      ['Grupos', String(groups.length)],
      ['Por hora', timeLine]
    ].forEach(function (pair) {
      const tr = el('tr');
      tr.appendChild(el('td', null, pair[0]));
      tr.appendChild(el('td', null, pair[1]));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    return box;
  }

  function summaryRowEl(r) {
    const tr = el('tr', r.type === 'group' ? 'is-group' : (r.type === 'total' ? 'is-total' : null));
    tr.appendChild(el('td', null, r.label));
    tr.appendChild(el('td', 'num', String(r.qty)));
    return tr;
  }

  /**
   * Arma las hojas de resumen repartiendo las filas según lo que realmente entra
   * en la hoja (se mide en un contenedor invisible, no con un número fijo).
   */
  function buildSummarySheets(groups, orders, opts) {
    const rows = buildSummaryRows(groups);
    const host = measureHost();
    const sheets = [];
    let i = 0;
    let page = 0;

    while (i < rows.length && page < 60) {
      const sheet = buildSheet(opts, 'Resumen de producción', null, null);
      const wrap = el('div', 'sum');
      if (page === 0) wrap.appendChild(totalsBlock(orders, groups));

      const box = el('div', null);
      box.appendChild(el('h3', null, 'Producción por grupo' + (page > 0 ? ' (cont.)' : '')));
      const table = el('table');
      const thead = el('thead');
      const htr = el('tr');
      htr.appendChild(el('th', null, 'Grupo / producto'));
      htr.appendChild(el('th', 'num', 'Cant.'));
      thead.appendChild(htr);
      table.appendChild(thead);
      const tbody = el('tbody');
      table.appendChild(tbody);
      box.appendChild(table);
      wrap.appendChild(box);
      wrap.appendChild(el('div', 'sum__foot', 'Generado desde el Excel de pedidos \u00b7 ' + (opts.date || '')));
      sheet.appendChild(wrap);

      host.appendChild(sheet);
      let placed = 0;
      while (i < rows.length) {
        const tr = summaryRowEl(rows[i]);
        tbody.appendChild(tr);
        if (wrap.scrollHeight > wrap.clientHeight + 1) {
          if (placed === 0) { i++; placed++; break; }   // fila gigante: la dejamos igual
          tbody.removeChild(tr);
          break;
        }
        i++; placed++;
      }
      host.removeChild(sheet);

      sheets.push(sheet);
      page++;
    }

    // numeración de hojas del resumen
    sheets.forEach(function (s, idx) {
      const right = s.querySelector('.sheet__page');
      right.appendChild(document.createTextNode('  \u00b7  hoja ' + (idx + 1) + '/' + sheets.length));
    });

    return sheets;
  }

  /* ---------- API ---------- */

  /**
   * Devuelve { sheets: HTMLElement[], stats: Object }
   */
  function build(orders, opts) {
    const layout = LAYOUTS[opts.layout] || LAYOUTS['2x3'];
    const perPage = layout.cols * layout.rows;
    const sorter = SORTERS[opts.sortBy] || SORTERS.hora;

    const groups = groupOrders(orders, opts.groupBy);
    groups.forEach(function (g) { g.orders.sort(sorter); });

    const sheets = [];

    if (opts.summary) {
      buildSummarySheets(groups, orders, opts).forEach(function (s) { sheets.push(s); });
    }

    const total = orders.length;
    const summarySheetCount = sheets.length;
    let printed = 0;

    if (opts.newPage) {
      groups.forEach(function (g) {
        const pages = chunk(g.orders, perPage);
        pages.forEach(function (pageOrders, pi) {
          const sheet = buildSheet(
            opts,
            opts.groupBy === 'ninguno' ? '' : g.label,
            'hoja ' + (pi + 1) + '/' + pages.length + ' · ' + g.orders.length + ' pedidos',
            opts.layout
          );
          pageOrders.forEach(function (o) {
            sheet.__grid.appendChild(buildTicket(o, opts, ++printed, total, g.label));
          });
          for (let k = pageOrders.length; k < perPage; k++) sheet.__grid.appendChild(el('div', 'tk tk--empty'));
          sheets.push(sheet);
        });
      });
    } else {
      const flat = [];
      groups.forEach(function (g) { g.orders.forEach(function (o) { flat.push({ o: o, g: g.label }); }); });
      const pages = chunk(flat, perPage);
      pages.forEach(function (pageItems, pi) {
        const labels = Array.from(new Set(pageItems.map(function (x) { return x.g; })));
        const sheet = buildSheet(
          opts,
          opts.groupBy === 'ninguno' ? '' : labels.slice(0, 3).join(' / ') + (labels.length > 3 ? ' …' : ''),
          'hoja ' + (pi + 1) + '/' + pages.length,
          opts.layout
        );
        pageItems.forEach(function (x) {
          sheet.__grid.appendChild(buildTicket(x.o, opts, ++printed, total, x.g));
        });
        for (let k = pageItems.length; k < perPage; k++) sheet.__grid.appendChild(el('div', 'tk tk--empty'));
        sheets.push(sheet);
      });
    }

    return {
      sheets: sheets,
      stats: {
        pedidos: orders.length,
        unidades: orders.reduce(function (a, o) { return a + o.units; }, 0),
        grupos: groups.length,
        observaciones: orders.filter(function (o) { return o.comment; }).length,
        hojas: sheets.length,
        // hojas mínimas posibles con este layout (sin cortar por grupo)
        hojasMinimas: Math.ceil(orders.length / perPage) + summarySheetCount
      }
    };
  }

  /* ---------- autofit: agranda el texto hasta llenar el ticket ---------- */

  const FIT_MIN = 0.60;
  const FIT_MAX = 1.85;
  const FIT_SLACK = 6;      // px de holgura: la impresora y el zoom de la vista previa redondean

  /**
   * ¿El contenido entra en el ticket? Se mide la base del último bloque contra
   * el borde inferior útil. Durante la medición se anula el margin-top:auto de
   * las observaciones (si no, el contenido siempre parece llenar la celda).
   */
  function contentFits(tk) {
    const last = tk.lastElementChild;
    if (!last) return true;
    const style = getComputedStyle(tk);
    const bottomLimit = tk.getBoundingClientRect().bottom
      - parseFloat(style.paddingBottom || 0)
      - parseFloat(style.borderBottomWidth || 0)
      - FIT_SLACK;
    return last.getBoundingClientRect().bottom <= bottomLimit;
  }

  /**
   * Ajusta el cuerpo de letra de cada ticket ya insertado en el DOM para que
   * aproveche todo el alto de su celda: crece si sobra espacio, achica si falta.
   * Hay que llamarla con el contenedor sin zoom para que las medidas sean exactas.
   */
  function autofit(root) {
    const tickets = root.querySelectorAll('.tk:not(.tk--empty)');
    if (!tickets.length) return;

    root.classList.add('is-measuring');

    for (let n = 0; n < tickets.length; n++) {
      const tk = tickets[n];
      if (!tk.clientHeight) continue;

      tk.style.setProperty('--fit', '1');
      let lo, hi;
      if (contentFits(tk)) { lo = 1; hi = FIT_MAX; }   // sobra lugar: crecemos
      else { lo = FIT_MIN; hi = 1; }                   // no entra: achicamos

      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        tk.style.setProperty('--fit', mid.toFixed(3));
        if (contentFits(tk)) lo = mid; else hi = mid;
      }
      tk.style.setProperty('--fit', lo.toFixed(3));
    }

    root.classList.remove('is-measuring');
  }

  global.Comandas = global.Comandas || {};
  global.Comandas.build = build;
  global.Comandas.autofit = autofit;
  global.Comandas.LAYOUTS = LAYOUTS;

})(window);
