// upload box for a whole folder. you can pick a folder, pick files,
// or drag and drop a folder onto it. shows the files grouped by folder
import React, { useRef, useState } from 'react';
import Icon from './Icon';

// when a folder is dropped, the browser gives us "entries", so we go
// through every sub folder to collect all the files inside
async function filesFromDrop(dataTransfer) {
  const entries = [...dataTransfer.items].map((item) => item.webkitGetAsEntry()).filter(Boolean);
  const files = [];

  const readFolder = (folder) =>
    new Promise((resolve) => {
      const reader = folder.createReader();
      const all = [];
      // readEntries only gives part of the list each time, so keep calling it
      const readMore = () =>
        reader.readEntries((batch) => {
          if (batch.length) {
            all.push(...batch);
            readMore();
          } else {
            resolve(all);
          }
        }, () => resolve(all));
      readMore();
    });

  async function walk(entry, path) {
    if (entry.isFile) {
      const file = await new Promise((resolve) => entry.file(resolve, () => resolve(null)));
      if (!file) return;
      // keep the folder path so we know which module the file belongs to
      Object.defineProperty(file, 'webkitRelativePath', { value: path + file.name });
      files.push(file);
    } else if (entry.isDirectory) {
      for (const child of await readFolder(entry)) await walk(child, path + entry.name + '/');
    }
  }

  for (const entry of entries) await walk(entry, '');
  return files;
}

// hidden system files like .DS_Store or ~$word temp files
const isJunk = (file) => /^\.|~\$|thumbs\.db/i.test(file.name);

// images: also allow photos (jpg, png). used for the timetable and exam routine
export default function FolderDrop({ icon, title, desc, files, onFiles, images = false }) {
  const [dragOver, setDragOver] = useState(false);
  const folderInput = useRef();
  const fileInput = useRef();

  const choose = (list) => onFiles([...list].filter((f) => !isJunk(f)));

  // group the files by folder name for the list
  const byFolder = {};
  files.forEach((f) => {
    const parts = (f.webkitRelativePath || f.name).split('/');
    let folder = '(files)';
    if (parts.length > 2) folder = parts[1];
    else if (parts.length === 2) folder = parts[0];
    (byFolder[folder] ||= []).push(f);
  });
  const folderCount = Object.keys(byFolder).length;

  async function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    choose(await filesFromDrop(e.dataTransfer));
  }

  return (
    <div>
      <div className={`drop ${dragOver ? 'hot' : ''} rounded-2xl p-7 text-center`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}>
        <div className="w-12 h-12 rounded-2xl mx-auto mb-3 grid place-items-center text-indigo-600" style={{ background: 'var(--tint)' }}>
          <Icon name={icon} size={22} />
        </div>
        <div className="text-[15px] font-extrabold">{title}</div>
        <div className="text-[12.5px] mt-1 muted max-w-md mx-auto">{desc}</div>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <button type="button" onClick={() => folderInput.current.click()} className="btn px-4 py-2.5 rounded-xl grad text-white text-[13px] font-bold inline-flex items-center gap-2">
            <Icon name="folder" size={16} /> Choose folder
          </button>
          <button type="button" onClick={() => fileInput.current.click()} className="btn px-4 py-2.5 rounded-xl border line bg-white text-[13px] font-bold">
            Choose files
          </button>
        </div>
        <div className="text-[11.5px] mt-3 muted">or drag and drop a folder here · PDF, PPTX, DOCX, TXT, CSV{images ? ' or a photo (JPG, PNG)' : ''}</div>
        <input ref={folderInput} type="file" className="hidden" webkitdirectory="" multiple onChange={(e) => choose(e.target.files)} />
        <input ref={fileInput} type="file" className="hidden" multiple accept={'.pdf,.pptx,.docx,.txt,.csv,.md' + (images ? ',.jpg,.jpeg,.png,.webp' : '')} onChange={(e) => choose(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="fade mt-4 card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="badge" style={{ background: '#d1fae5', color: '#047857' }}>
              <Icon name="check" size={12} /> {files.length} file{files.length > 1 ? 's' : ''}
            </span>
            <span className="text-[12.5px] muted">{folderCount} folder{folderCount > 1 ? 's' : ''}</span>
            <button type="button" onClick={() => onFiles([])} className="ml-auto text-[12px] font-bold text-slate-400 hover:text-rose-500">Clear</button>
          </div>
          <div className="max-h-[210px] overflow-y-auto space-y-2 pr-1">
            {Object.entries(byFolder).map(([folder, list]) => (
              <div key={folder}>
                <div className="text-[12.5px] font-bold flex items-center gap-1.5"><Icon name="folder" size={14} className="text-indigo-500" /> {folder}</div>
                {list.map((f, i) => (
                  <div key={i} className="text-[12px] muted pl-5 truncate flex items-center gap-1.5">
                    <Icon name="file" size={12} /> {f.name} <span className="opacity-60">· {(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
