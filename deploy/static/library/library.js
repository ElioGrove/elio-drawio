const element = id => document.getElementById(id);
const api = '/api/diagrams';
const quietPeriod = 30_000;
const automaticInterval = 120_000;
const blank = '<mxfile><diagram name="第 1 页"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
let files = [];
let nameOrder = 0;
const names = new Intl.Collator('zh-CN', { numeric: true });
const sizes = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
let current;
let timer;
let busy = false;

try { element('auto').checked = localStorage.getItem('elio-drawio-auto') !== 'off'; } catch {}

function endpoint(params = {}) {
  return api + '?' + new URLSearchParams(params);
}

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok || response.redirected) {
    let message;
    try { message = (await response.json()).error; } catch {}
    const error = new Error(message || '请求失败。请刷新页面确认登录状态后重试。');
    error.status = response.status;
    throw error;
  }
  return response;
}

function show(message) { element('notice').textContent = message; }
function status(message) { element('save-status').textContent = message; }

function sizeLabel(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 ** 2) return sizes.format(bytes / 1024) + ' KiB';
  return sizes.format(bytes / 1024 ** 2) + ' MiB';
}

function fileButton(label, className, action) {
  const button = document.createElement('button');
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', action);
  return button;
}

async function changeFile(file, method, name) {
  if (busy || current) return;
  busy = true;
  try {
    await request(endpoint({ id: file.id, ...(name === undefined ? {} : { name }) }), {
      method, headers: { 'If-Match': file.etag }
    });
    await refresh();
  } catch (error) {
    show(error.message);
  } finally {
    busy = false;
  }
}

const twoColumns = matchMedia('(min-width: 960px)');

function render() {
  const list = element('list');
  const second = element('second-list');
  list.replaceChildren();
  second.replaceChildren();
  element('second-table').hidden = !twoColumns.matches;
  const ordered = nameOrder ? [...files].sort((a, b) => nameOrder * names.compare(a.name, b.name)) : files;
  const split = twoColumns.matches ? Math.ceil(ordered.length / 2) : ordered.length;
  for (const [index, file] of ordered.entries()) {
    const row = (index < split ? list : second).insertRow();
    row.insertCell().append(fileButton(file.name, 'file-link', () => openFile(file)));
    row.insertCell().textContent = sizeLabel(file.size);
    const time = document.createElement('time');
    time.dateTime = file.updated;
    time.textContent = new Date(file.updated).toLocaleString('zh-CN');
    row.insertCell().append(time);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      fileButton('重命名', '', () => {
        const name = prompt('新的文件名称', file.name)?.trim();
        if (name && name !== file.name) changeFile(file, 'PATCH', name);
      }),
      fileButton('删除', 'delete', () => {
        if (confirm('永久删除「' + file.name + '」？')) changeFile(file, 'DELETE');
      })
    );
    row.insertCell().append(actions);
  }
}

function showEditor(open) {
  element('library-bar').hidden = open;
  element('library').hidden = open;
  element('editor-bar').hidden = !open;
  element('workspace').hidden = !open;
}

async function refresh() {
  const all = [];
  let cursor;
  do {
    const data = await (await request(endpoint(cursor ? { cursor } : {}))).json();
    all.push(...data.files);
    cursor = data.next;
  } while (cursor);
  files = all.sort((a, b) => b.updated.localeCompare(a.updated));
  render();
  show(files.length ? '' : '还没有流程图。可以导入已有文件或新建一份。');
  element('import').disabled = false;
  element('new').disabled = false;
}

async function create(name, xml) {
  return (await request(endpoint({ name }), {
    method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: xml
  })).json();
}

function post(session, message) {
  session.frame.contentWindow.postMessage(JSON.stringify(message), location.origin);
}

async function openFile(file) {
  if (current || busy) return;
  busy = true;
  try {
    const response = await request(endpoint({ id: file.id }));
    const xml = await response.text();
    const frame = document.createElement('iframe');
    frame.title = '流程图编辑器';
    current = { ...file, etag: response.headers.get('X-Diagram-Version'), xml, saved: xml,
      changed: 0, lastWrite: Date.now(), ready: false, writing: false, frame };
    showEditor(true);
    element('name').textContent = file.name;
    element('save').disabled = true;
    element('download').disabled = false;
    status('正在打开…');
    show('');
    frame.src = '/?embed=1&proto=json&libraries=1&noExitBtn=1&saveAndExit=0&keepmodified=1';
    element('editor').replaceChildren(frame);
  } catch (error) {
    show(error.message);
  } finally {
    busy = false;
  }
}

function schedule(session) {
  clearTimeout(timer);
  if (!element('auto').checked || !session.ready || session.conflict || session.autoPaused ||
      session.writing || session.xml === session.saved) return;
  const delay = Math.max(quietPeriod - (Date.now() - session.changed),
    automaticInterval - (Date.now() - session.lastWrite));
  timer = setTimeout(() => save(session, false), Math.max(0, delay));
}

async function save(session, manual) {
  if (session !== current || session.conflict) return;
  if (session.writing) {
    session.pendingManual ||= manual;
    return;
  }
  if (session.xml === session.saved) {
    status('已保存到云端');
    post(session, { action: 'status', message: '已保存到云端', modified: false });
    return;
  }
  clearTimeout(timer);
  const xml = session.xml;
  session.writing = true;
  session.lastWrite = Date.now();
  status('正在保存…');
  try {
    const response = await request(endpoint({ id: session.id, name: session.name }), {
      method: 'PUT',
      headers: { 'If-Match': session.etag, 'Content-Type': 'text/plain; charset=utf-8' },
      body: xml
    });
    session.etag = response.headers.get('X-Diagram-Version');
    session.saved = xml;
    session.autoPaused = false;
    const dirty = session.xml !== session.saved;
    status(dirty ? '还有修改待保存' : '已保存到云端');
    post(session, { action: 'status', message: dirty ? '还有修改待保存' : '已保存到云端', modified: dirty });
  } catch (error) {
    session.conflict = error.status === 412;
    session.autoPaused = true;
    status(error.message);
  } finally {
    session.writing = false;
    if (session.pendingManual) {
      session.pendingManual = false;
      save(session, true);
    } else {
      schedule(session);
    }
  }
}

window.addEventListener('message', event => {
  const session = current;
  if (!session || event.origin !== location.origin || event.source !== session.frame.contentWindow) return;
  let message;
  try { message = JSON.parse(event.data); } catch { return; }
  if (message?.event === 'init') {
    post(session, { action: 'load', xml: session.xml, autosave: 1, title: session.name });
  } else if (message?.event === 'load') {
    session.ready = true;
    element('save').disabled = false;
    status('已从云端打开');
  } else if (session.ready && typeof message?.xml === 'string' &&
      (message.event === 'autosave' || message.event === 'save')) {
    if (session.xml !== message.xml) {
      session.xml = message.xml;
      session.changed = Date.now();
      if (!session.conflict) status(session.xml === session.saved ? '已保存到云端' : '有修改待保存');
    }
    if (message.event === 'save') save(session, true);
    else schedule(session);
  }
});

function sortByName() {
  nameOrder = nameOrder === 1 ? -1 : 1;
  for (const prefix of ['', 'second-']) {
    element(prefix + 'name-heading').setAttribute('aria-sort', nameOrder === 1 ? 'ascending' : 'descending');
    element(prefix + 'sort-arrow').textContent = nameOrder === 1 ? '↑' : '↓';
  }
  render();
}

element('sort-name').addEventListener('click', sortByName);
element('second-sort-name').addEventListener('click', sortByName);
twoColumns.addEventListener('change', render);
element('save').addEventListener('click', () => {
  if (current?.ready) post(current, { action: 'invokeAction', actionName: 'save' });
});
element('auto').addEventListener('change', () => {
  try { localStorage.setItem('elio-drawio-auto', element('auto').checked ? 'on' : 'off'); } catch {}
  if (current) schedule(current);
});
element('download').addEventListener('click', () => {
  if (!current) return;
  const url = URL.createObjectURL(new Blob([current.xml], { type: 'application/xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = current.name + '.drawio';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element('back').addEventListener('click', () => {
  if (current?.writing) { status('正在保存，请稍候。'); return; }
  if (current && current.xml !== current.saved && !confirm('还有未保存的修改，确定返回？')) return;
  clearTimeout(timer);
  current = undefined;
  element('editor').replaceChildren();
  showEditor(false);
  refresh().catch(error => show(error.message));
});
window.addEventListener('beforeunload', event => {
  if (current && (current.writing || current.xml !== current.saved)) {
    event.preventDefault();
    event.returnValue = '';
  }
});

element('new').addEventListener('click', async () => {
  const name = prompt('流程图名称');
  if (!name?.trim() || current || busy) return;
  busy = true;
  let file;
  try { file = await create(name, blank); } catch (error) { show(error.message); }
  finally { busy = false; }
  if (file) openFile(file);
});
element('import').addEventListener('click', () => element('files').click());
element('files').addEventListener('change', async event => {
  if (current || busy) return;
  busy = true;
  const errors = [];
  const selected = [...event.target.files];
  for (const file of selected) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('文件超过 10 MiB。');
      await create(file.name, file);
    } catch (error) {
      errors.push(file.name + '：' + error.message);
    }
  }
  event.target.value = '';
  busy = false;
  try {
    await refresh();
    show(errors.length ? errors.join(' ') : '已导入 ' + selected.length + ' 个文件。');
  } catch (error) { show(error.message); }
});
refresh().catch(error => show(error.message));
