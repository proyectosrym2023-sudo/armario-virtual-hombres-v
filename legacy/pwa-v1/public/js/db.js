// IndexedDB local: el armario vive en el teléfono (privacidad primero).
const NOMBRE = 'armario-virtual-hombres';
let conexion;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((res, rej) => {
    const r = indexedDB.open(NOMBRE, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('prendas', { keyPath: 'id' });
      db.createObjectStore('fotos');   // id → { foto: Blob, mini: Blob }
      db.createObjectStore('kv');      // ajustes, medidas, licencia, cajas, ia_log
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return conexion;
}

async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((res, rej) => {
    const t = db.transaction(store, modo);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const db = {
  todas: () => tx('prendas', 'readonly', s => s.getAll()),
  prenda: id => tx('prendas', 'readonly', s => s.get(id)),
  guardarPrenda: p => tx('prendas', 'readwrite', s => s.put({ ...p, actualizadoEn: new Date().toISOString() })),
  borrarPrenda: id => tx('prendas', 'readwrite', s => s.delete(id)),
  foto: id => tx('fotos', 'readonly', s => s.get(id)),
  guardarFoto: (id, v) => tx('fotos', 'readwrite', s => s.put(v, id)),
  borrarFoto: id => tx('fotos', 'readwrite', s => s.delete(id)),
  leer: (k, def = null) => tx('kv', 'readonly', s => s.get(k)).then(v => v ?? def),
  escribir: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
  async borrarTodo() {
    for (const s of ['prendas', 'fotos', 'kv']) await tx(s, 'readwrite', st => st.clear());
  },
};
