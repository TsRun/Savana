// File unique de synchronisation Riot, pour les comptes comme pour les amis.
// Les requêtes passent de toute façon une par une par le limiteur de riotApi.js :
// une seule file garde l'ordre d'arrivée et donne un état lisible à l'interface.

const handlers = {};   // kind -> async (id) => void
const queue = [];      // { kind, id }
let current = null;    // élément en cours
let processing = false;

export function registerSyncHandler(kind, fn) {
  handlers[kind] = fn;
}

/**
 * Met un joueur en file. Sans effet s'il y est déjà ou s'il est en cours de mise à jour.
 */
export function enqueueSync(kind, id) {
  const numId = Number(id);
  const same = j => j && j.kind === kind && j.id === numId;
  if (same(current) || queue.some(same)) return;
  queue.push({ kind, id: numId });
  process();
}

export function queuedSyncIds(kind) {
  return [...new Set(queue.filter(j => j.kind === kind).map(j => j.id))];
}

export function currentSyncId(kind) {
  return current && current.kind === kind ? current.id : null;
}

// Ids en file ou en cours pour un type de joueur
export function activeSyncIds(kind) {
  const ids = new Set(queuedSyncIds(kind));
  const cur = currentSyncId(kind);
  if (cur !== null) ids.add(cur);
  return ids;
}

async function process() {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    current = queue.shift();
    try {
      await handlers[current.kind]?.(current.id);
    } catch (e) {
      console.error(`[SYNC] ${current.kind} ${current.id}:`, e);
    }
    current = null;
  }
  processing = false;
}
