import { deviceId } from '../session.js';
import { newId, nowIso } from '../util.js';

let seqCounter = 0;

/**
 * Build a local Operation row. `seq` keeps push order stable when
 * several ops share a millisecond timestamp.
 */
export function makeOperation(entityType, entityId, action, payload, createdAt = nowIso()) {
  seqCounter = (seqCounter + 1) % 1000;
  return {
    id: newId(),
    device_id: deviceId(),
    entity_type: entityType,
    entity_id: entityId,
    action,
    payload: payload || {},
    created_at: createdAt,
    synced: 0,
    seq: Date.now() * 1000 + seqCounter,
  };
}

export function toWire(op) {
  return {
    id: op.id,
    device_id: op.device_id,
    entity_type: op.entity_type,
    entity_id: op.entity_id,
    action: op.action,
    payload: op.payload || {},
    created_at: op.created_at,
  };
}
