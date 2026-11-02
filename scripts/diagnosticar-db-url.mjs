// Diagnóstico de SUPABASE_DB_URL SIN mostrar la contraseña.
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const raw = process.env.SUPABASE_DB_URL ?? '';
let db;
try { db = new URL(raw); } catch { console.log('SUPABASE_DB_URL no es una URL válida (¿caracteres especiales sin codificar en la contraseña?)'); process.exit(1); }
const usuario = decodeURIComponent(db.username);
console.log('Ref del proyecto (URL)  :', ref, `(${ref.length} caracteres)`);
console.log('Usuario en DB_URL       :', usuario, `(ref de ${usuario.replace(/^postgres\.?/, '').length} caracteres)`);
console.log('¿Coinciden?             :', usuario === `postgres.${ref}` || (usuario === 'postgres' && db.hostname.includes(ref)));
console.log('Host / puerto / base    :', db.hostname, '/', db.port || '(defecto)', '/', db.pathname);
console.log('Contraseña presente     :', db.password ? `sí (${decodeURIComponent(db.password).length} caracteres)` : 'NO');
console.log('Contiene [YOUR-PASSWORD]:', /YOUR-PASSWORD/i.test(raw));
