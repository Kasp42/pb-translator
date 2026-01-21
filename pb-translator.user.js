// ==UserScript==
// @name         Pathbuilder2e translator
// @namespace    https://pathbuilder2e.com/
// @version      1.0
// @description  Local translation layer + grid viewer + cell translation editor + apply to IndexedDB
// @author       Kasp42
// @match        https://pathbuilder2e.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pathbuilder2e.com
// @grant        none
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Kasp42/pb-translator/master/pb-translator.user.js
// @updateURL    https://raw.githubusercontent.com/Kasp42/pb-translator/master/pb-translator.user.js
// ==/UserScript==

(function ()
{
  'use strict'

  /**
   * What it does:
   * - Loads original datasets from CDN (DATA_AVAILABLE).
   * - Shows a popup editor (grid) where you can click a cell and edit translations.
   * - Translations are stored in localStorage (LS_KEY) in the format:
   *   { "<LANG>": { "<TABLE>": { "<ORIGINAL>": "<TRANSLATION>" } } }
   * - You can apply current language translations to IndexedDB (Pathbuilder runtime DB) for all records.
   *
   * Notes:
   * - We hide sqlite_autoindex_* tables.
   * - Grid is read-only for originals; translation is edited via a cell popup.
   * - "Apply to IndexedDB" patches CSV cells by exact text match (ORIGINAL => TRANSLATION).
   */

  const DATA_URL_ORIGINAL = 'https://pathbuilder2e-data.b-cdn.net/';
  // TODO: Load translations from remote.
  const TRANSLATION_URL = 'https://raw.githubusercontent.com/Kasp42/pb-translator/master/translations/';
  const DATA_AVAILABLE = ['data123', 'data_remastered61']
  const ORIGINAL_DATA_CACHE = {};
  const LANGUAGES = ['ru'];
  const DEFAULT_LANG = 'en';

  const DB_NAME = 'pathbuilder2e_db';
  const STORE_NAME = 'data';

  const LS_KEY = 'pathbuilder_translations';
  const LS_LANG_KEY = 'pathbuilder_lang';

  const HIDE_TABLE_PREFIX = 'sqlite_autoindex_';

  function loadTranslations ()
  {
    try
    {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {}
    } catch
    {
      return {}
    }
  }

  function saveTranslations (data)
  {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  }

  function getTranslation (lang, table, original)
  {
    const all = loadTranslations()
    return all?.[lang]?.[table]?.[original] ?? null
  }

  function setTranslation (lang, table, original, translated)
  {
    const all = loadTranslations()
    all[lang] ??= {}
    all[lang][table] ??= {}

    const cleaned = (translated ?? '').trim()

    if (!cleaned || cleaned === original)
    {
      delete all[lang][table][original]
      if (Object.keys(all[lang][table]).length === 0) delete all[lang][table]
      if (Object.keys(all[lang]).length === 0) delete all[lang]
    }
    else
    {
      all[lang][table][original] = translated
    }

    saveTranslations(all)
  }

  function parseCSV (csv)
  {
    csv = String(csv ?? '').replace(/\r\n/g, '\n')

    const rows = []
    let row = []
    let val = ''
    let inQuotes = false

    for (let i = 0; i < csv.length; i++)
    {
      const c = csv[i]
      const n = csv[i + 1]

      if (c === '"')
      {
        if (inQuotes && n === '"')
        {
          val += '"'
          i++
        }
        else
        {
          inQuotes = !inQuotes
        }
      }
      else if (c === ',' && !inQuotes)
      {
        row.push(val)
        val = ''
      }
      else if ((c === '\n' || c === '\r') && !inQuotes)
      {
        row.push(val)
        rows.push(row)
        row = []
        val = ''
        while (i + 1 < csv.length && (csv[i + 1] === '\n' || csv[i + 1] === '\r'))
        {
          i++
        }
      }
      else
      {
        val += c
      }
    }

    row.push(val)
    rows.push(row)

    return rows
  }

  function toCSV (rows)
  {
    return rows
    .map((row) =>
      row
      .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
      .join(',')
    )
    .join('\n')
  }

  async function loadAllOriginals() {
    for (const key of DATA_AVAILABLE) {
      const res = await fetch(DATA_URL_ORIGINAL + key + '.txt')
      if (!res.ok)
        throw new Error('Failed to fetch: ' + res.status)

      const text = await res.text()

      const jsonText = LZString.decompressFromBase64(text)

      if (!jsonText)
        throw new Error('Decompress failed (base64)')

      ORIGINAL_DATA_CACHE[key] = JSON.parse(jsonText)
    }
  }

  function el (tag, styleText, text)
  {
    const node = document.createElement(tag)
    if (styleText) node.style = styleText
    if (text != null) node.textContent = text
    return node
  }

  function openTranslatePopup (table, original)
  {
    const overlay = document.createElement('div')
    overlay.style = `
    position:fixed;inset:0;
    background:rgba(0,0,0,.7);
    z-index:1000001;
    display:flex;
    align-items:center;
    justify-content:center;
  `

    const box = document.createElement('div')
    box.style = `
    background:#111;
    padding:16px;
    width:700px;
    color:#eee;
    font-family:monospace;
    border:1px solid #444;
  `

    const title = document.createElement('div')
    title.textContent = table
    title.style = 'margin-bottom:10px;font-weight:bold;'

    const orig = document.createElement('textarea')
    orig.value = original
    orig.readOnly = true
    orig.style = 'width: 100%;margin-bottom: 10px;field-sizing: content;min-height: 4rem;resize: none;'

    box.append(title, orig)

    const inputs = {}

    LANGUAGES.forEach(lang =>
    {
      const label = document.createElement('div')
      label.textContent = lang
      label.style = 'margin-top:8px;'

      const ta = document.createElement('textarea')
      ta.value = getTranslation(lang, table, original)
      ta.style = 'width: 100%;field-sizing: content;min-height: 4rem;resize: none;'
      inputs[lang] = ta

      box.append(label, ta)
    })

    const save = document.createElement('button')
    save.textContent = 'Save'
    save.style = 'margin-top:10px;'
    save.onclick = () =>
    {
      LANGUAGES.forEach(lang =>
      {
        setTranslation(lang, table, original, inputs[lang].value)
      })
      overlay.remove()
    }

    box.appendChild(save)
    overlay.appendChild(box)
    overlay.onclick = e => e.target === overlay && overlay.remove()

    document.body.appendChild(overlay)
  }

  function renderGridTranslated ({ csv, container, tableName })
  {
    container.innerHTML = ''

    const rows = parseCSV(csv)
    const headers = rows.shift() || []

    let sortCol = null
    let sortAsc = true

    const table = document.createElement('table')
    table.style = 'border-collapse:collapse;width:100%;color:#eee;font-family:monospace;'

    const thead = document.createElement('thead')
    const trh = document.createElement('tr')

    headers.forEach((h, i) =>
    {
      const th = document.createElement('th')
      th.textContent = h
      th.style =
        'position:sticky;top:0;background:#222;cursor:pointer;border:1px solid #444;padding:4px;font-weight:600;'

      th.onclick = () =>
      {
        sortAsc = sortCol === i ? !sortAsc : true
        sortCol = i

        rows.sort((a, b) =>
        {
          const A = a[i] ?? ''
          const B = b[i] ?? ''
          return sortAsc
            ? A.localeCompare(B, undefined, { numeric: true })
            : B.localeCompare(A, undefined, { numeric: true })
        })

        renderGridTranslated({
          csv: toCSV([headers, ...rows]),
          container,
          tableName
        })
      }

      trh.appendChild(th)
    })

    thead.appendChild(trh)
    table.appendChild(thead)

    const tbody = document.createElement('tbody')

    rows.forEach((r) =>
    {
      const tr = document.createElement('tr')

      r.forEach((cell) =>
      {
        const td = document.createElement('td')
        td.style = 'border:1px solid #333;padding:3px;min-width:80px;vertical-align:top;cursor:pointer;'

        const original = cell ?? ''
        td.textContent = original

        td.title = 'Click to edit translation'

        td.onclick = () =>
        {
          openTranslatePopup(tableName, original)
        }

        tr.appendChild(td)
      })

      tbody.appendChild(tr)
    })

    table.appendChild(tbody)
    container.appendChild(table)
  }

  function openEditorPopup ()
  {

    const overlay = el(
      'div',
      `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.6);
      z-index: 999999;
      display: flex;
      justify-content: center;
      align-items: center;
    `
    )

    const panel = el(
      'div',
      `
      width: 92%;
      height: 92%;
      background: #111;
      color: #eee;
      display: flex;
      font-family: monospace;
      border: 1px solid #333;
      position: relative;
    `
    )

    const sidebar = el(
      'div',
      `
      width: 320px;
      border-right: 1px solid #444;
      overflow: auto;
      padding-top: 56px;
    `
    )

    const editor = el(
      'div',
      `
      flex: 1;
      overflow: auto;
      background: #000;
      padding-top: 56px;
    `
    )

    const topBar = el(
      'div',
      `
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 44px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #151515;
      border-bottom: 1px solid #333;
    `
    )

    const title = el('div', 'font-weight:700;margin-right:10px;', 'PB2E Translator')

    const dataSelect = document.createElement('select')
    DATA_AVAILABLE.forEach((k) =>
    {
      const o = document.createElement('option')
      o.value = k
      o.textContent = k
      dataSelect.appendChild(o)
    })

    let currentDataset = dataSelect.value
    let tables = {}
    let selectedTable = null

    const status = el('div', 'margin-left:0;opacity:.8;font-size:12px;', 'Ready')

    const close = document.createElement('div')
    close.innerHTML = '&times;'
    close.style = `
      position:absolute;
      top:10px;
      right:14px;
      font-size:28px;
      cursor:pointer;
    `
    close.onclick = () => {
      overlay.remove()
      patchIndexedDB(getCurrentLang())
    }

    topBar.append(title, dataSelect, close, status)

    panel.appendChild(sidebar)
    panel.appendChild(editor)
    panel.appendChild(topBar)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    overlay.addEventListener('click', (e) =>
    {
      if (e.target === overlay) overlay.remove()
    })

    function renderTableList ()
    {
      sidebar.innerHTML = ''
      const list = el('div', 'padding:0 0 8px 0;')
      sidebar.appendChild(list)

      const names = Object.keys(tables)
      .filter((t) => !t.startsWith(HIDE_TABLE_PREFIX))
      .sort((a, b) => a.localeCompare(b))

      names.forEach((tableName) =>
      {
        const btn = el(
          'div',
          `
          padding: 6px 10px;
          cursor: pointer;
          border-bottom: 1px solid #333;
          user-select: none;
        `,
          tableName
        )

        function setSelectedStyle (isSelected)
        {
          btn.style.background = isSelected ? '#222' : ''
          btn.style.color = isSelected ? '#fff' : '#eee'
        }

        setSelectedStyle(selectedTable === tableName)

        btn.onclick = () =>
        {
          if (selectedTable === tableName) return // do not re-render same
          selectedTable = tableName

          renderTableList()

          status.textContent = `Table: ${tableName}`
          editor.dataset.table = tableName

          renderGridTranslated({
            csv: tables[tableName],
            container: editor,
            tableName
          })
        }

        list.appendChild(btn)
      })

      if (names.length === 0)
      {
        list.appendChild(el('div', 'padding:10px;opacity:.7;', 'No tables found'))
      }
    }

    async function reloadDataset ()
    {
      status.textContent = 'Loading dataset...'
      selectedTable = null
      editor.innerHTML = ''
      tables = ORIGINAL_DATA_CACHE[currentDataset]
      status.textContent = `Loaded: ${currentDataset} (${Object.keys(tables).length} tables)`
      renderTableList()
    }

    dataSelect.onchange = async() =>
    {
      currentDataset = dataSelect.value
      await reloadDataset()
    }

    reloadDataset().catch((e) =>
    {
      console.error(e)
      status.textContent = 'Failed to load dataset (see console)'
    })
  }

  function getCurrentLang ()
  {
    return localStorage.getItem(LS_LANG_KEY) || DEFAULT_LANG
  }

  function setCurrentLang (lang)
  {
    localStorage.setItem(LS_LANG_KEY, lang)
  }

  function patchIndexedDB (lang)
  {
    const tr = loadTranslations()[lang] || {}

    const req = indexedDB.open(DB_NAME)
    req.onsuccess = e =>
    {
      const db = e.target.result
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      store.openCursor().onsuccess = async ev =>
      {
        const cursor = ev.target.result
        if (!cursor) return

        let tables = ORIGINAL_DATA_CACHE[cursor.key]

        Object.entries(tr).forEach(([table, map]) =>
        {
          if (!tables[table]) return

          const rows = parseCSV(tables[table])
          for (let i = 1; i < rows.length; i++)
          {
            for (let j = 0; j < rows[i].length; j++)
            {
              const o = rows[i][j]
              if (map[o]) rows[i][j] = map[o]
            }
          }
          tables[table] = toCSV(rows)
        })

        const encoded = LZString.compressToBase64(JSON.stringify(tables))
        store.put(encoded, cursor.key)

        cursor.continue()
      }
    }
  }

  function installControls ()
  {
    const box = document.createElement('div')
    box.style = `
    position:fixed;
    top:5px;
    right:5px;
    z-index:999998;
    background:#111;
    border:1px solid #444;
    padding:6px;
    font-family:monospace;
    display: inline-flex;
  `

    const langSel = document.createElement('select')
    const lang_list = [...LANGUAGES, DEFAULT_LANG];
    lang_list.forEach(l =>
    {
      const o = document.createElement('option')
      o.value = l
      o.textContent = l
      langSel.appendChild(o)
    })
    langSel.value = getCurrentLang()

    langSel.onchange = () =>
    {
      setCurrentLang(langSel.value)
      patchIndexedDB(langSel.value)
    }

    const btn = document.createElement('button')
    btn.textContent = 'Translate Panel'
    btn.style = 'padding: 6px 10px;background: rgb(17, 17, 17);color: rgb(238, 238, 238);border: 1px solid rgb(68, 68, 68);font-family: monospace;cursor: pointer;width: 150px;margin-left: 7px;'
    btn.onclick = openEditorPopup

    box.append(langSel, btn)
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box))
  }

  const dom_script = document.createElement('script')
  dom_script.src = 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js'
  dom_script.onload = async function ()
  {
    // expose for debugging if you want
    window.openPathbuilderEditor = openEditorPopup
    installControls()
    await loadAllOriginals()
  }
  document.head.appendChild(dom_script);
})();
