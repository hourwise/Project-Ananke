import Database from 'better-sqlite3';
import { hashCanonicalCall } from '@ananke/authority-engine';
import {
  ContentApprovalBinding,
  ContentApprovalReceipt,
  type ContentApprovalBinding as ContentApprovalBindingType,
  type ContentApprovalReceipt as ContentApprovalReceiptType,
  type OperatorIdentity,
} from '@ananke/schema';

export interface ContentApprovalCheck {
  valid: boolean;
  receipt?: ContentApprovalReceiptType;
  reason?:
    | 'Content approval not found'
    | 'Content approval already used'
    | 'Content approval expired'
    | 'Content approval pending'
    | 'Content approval rejected'
    | 'CONTENT_APPROVAL_BINDING_MISMATCH';
}

export interface ContentApprovalStore {
  request(
    toolName: string,
    binding: ContentApprovalBindingType,
    expiresAt: string,
  ): ContentApprovalReceiptType;
  get(id: string): ContentApprovalReceiptType | undefined;
  check(
    id: string,
    toolName: string,
    binding: ContentApprovalBindingType,
  ): ContentApprovalCheck;
  approve(id: string, operator: OperatorIdentity): ContentApprovalReceiptType | undefined;
  reject(id: string, operator: OperatorIdentity): ContentApprovalReceiptType | undefined;
  consume(id: string): void;
  pending(): ContentApprovalReceiptType[];
}

function bindingMaterial(binding: ContentApprovalBindingType): Record<string, unknown> {
  return {
    contentHash: binding.contentHash,
    observationId: binding.observationId,
    requestedExposure: binding.requestedExposure,
    destination: binding.destination,
    purpose: binding.purpose,
    policyVersion: binding.policyVersion,
    selection: binding.selection,
  };
}

function verifiedBinding(binding: ContentApprovalBindingType): ContentApprovalBindingType {
  const parsed = ContentApprovalBinding.parse(binding);
  if (parsed.bindingHash !== hashCanonicalCall(bindingMaterial(parsed))) {
    throw new TypeError('Content approval binding hash does not match its binding material');
  }
  return parsed;
}

function expired(receipt: ContentApprovalReceiptType): boolean {
  return new Date(receipt.expiresAt) <= new Date();
}

function clone(receipt: ContentApprovalReceiptType): ContentApprovalReceiptType {
  return structuredClone(receipt);
}

export class InMemoryContentApprovalStore implements ContentApprovalStore {
  private receipts = new Map<string, ContentApprovalReceiptType>();

  request(
    toolName: string,
    binding: ContentApprovalBindingType,
    expiresAt: string,
  ): ContentApprovalReceiptType {
    const receipt: ContentApprovalReceiptType = {
      id: crypto.randomUUID(),
      toolName,
      binding: verifiedBinding(binding),
      status: 'pending',
      requestedAt: new Date().toISOString(),
      expiresAt,
      used: false,
    };
    this.receipts.set(receipt.id, receipt);
    return clone(receipt);
  }

  get(id: string): ContentApprovalReceiptType | undefined {
    const receipt = this.receipts.get(id);
    return receipt ? clone(receipt) : undefined;
  }

  check(
    id: string,
    toolName: string,
    binding: ContentApprovalBindingType,
  ): ContentApprovalCheck {
    const receipt = this.receipts.get(id);
    if (!receipt) return { valid: false, reason: 'Content approval not found' };
    if (receipt.used) return { valid: false, receipt: clone(receipt), reason: 'Content approval already used' };
    if (expired(receipt)) return { valid: false, receipt: clone(receipt), reason: 'Content approval expired' };
    if (receipt.status === 'pending') return { valid: false, receipt: clone(receipt), reason: 'Content approval pending' };
    if (receipt.status === 'rejected') return { valid: false, receipt: clone(receipt), reason: 'Content approval rejected' };

    const proposed = verifiedBinding(binding);
    if (receipt.toolName !== toolName || receipt.binding.bindingHash !== proposed.bindingHash) {
      return { valid: false, receipt: clone(receipt), reason: 'CONTENT_APPROVAL_BINDING_MISMATCH' };
    }
    return { valid: true, receipt: clone(receipt) };
  }

  approve(id: string, operator: OperatorIdentity): ContentApprovalReceiptType | undefined {
    const receipt = this.receipts.get(id);
    if (!receipt || receipt.used || receipt.status !== 'pending' || expired(receipt)) return undefined;
    receipt.status = 'approved';
    receipt.approvedBy = operator.operatorId;
    receipt.approvedBySessionId = operator.sessionId;
    receipt.approvedAt = new Date().toISOString();
    return clone(receipt);
  }

  reject(id: string, operator: OperatorIdentity): ContentApprovalReceiptType | undefined {
    const receipt = this.receipts.get(id);
    if (!receipt || receipt.used || receipt.status !== 'pending' || expired(receipt)) return undefined;
    receipt.status = 'rejected';
    receipt.rejectedBy = operator.operatorId;
    receipt.rejectedBySessionId = operator.sessionId;
    receipt.rejectedAt = new Date().toISOString();
    return clone(receipt);
  }

  consume(id: string): void {
    const receipt = this.receipts.get(id);
    if (receipt?.status === 'approved') receipt.used = true;
  }

  pending(): ContentApprovalReceiptType[] {
    return [...this.receipts.values()]
      .filter((receipt) => !receipt.used && receipt.status === 'pending' && !expired(receipt))
      .map(clone);
  }
}

const SCHEMA_SQL = [
  'CREATE TABLE IF NOT EXISTS content_approval_receipts (',
  '  id TEXT PRIMARY KEY,',
  '  tool_name TEXT NOT NULL,',
  '  binding TEXT NOT NULL,',
  '  status TEXT NOT NULL,',
  '  requested_at TEXT NOT NULL,',
  '  approved_by TEXT,',
  '  approved_by_session_id TEXT,',
  '  approved_at TEXT,',
  '  rejected_by TEXT,',
  '  rejected_by_session_id TEXT,',
  '  rejected_at TEXT,',
  '  expires_at TEXT NOT NULL,',
  '  used INTEGER NOT NULL DEFAULT 0',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_content_approval_status ON content_approval_receipts(status, used, expires_at);',
].join('\n');

interface ReceiptRow {
  id: string;
  tool_name: string;
  binding: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  approved_by: string | null;
  approved_by_session_id: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_by_session_id: string | null;
  rejected_at: string | null;
  expires_at: string;
  used: number;
}

function rowToReceipt(row: ReceiptRow): ContentApprovalReceiptType {
  return ContentApprovalReceipt.parse({
    id: row.id,
    toolName: row.tool_name,
    binding: JSON.parse(row.binding),
    status: row.status,
    requestedAt: row.requested_at,
    approvedBy: row.approved_by ?? undefined,
    approvedBySessionId: row.approved_by_session_id ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectedBy: row.rejected_by ?? undefined,
    rejectedBySessionId: row.rejected_by_session_id ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    expiresAt: row.expires_at,
    used: row.used === 1,
  });
}

/**
 * Durable local receipt store. Use a protected database path in production so
 * elevated content approvals survive restart and can be audited.
 */
export class SqliteContentApprovalStore implements ContentApprovalStore {
  private readonly db: Database.Database;
  private closed = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA_SQL);
  }

  request(
    toolName: string,
    binding: ContentApprovalBindingType,
    expiresAt: string,
  ): ContentApprovalReceiptType {
    this.assertOpen();
    const receipt: ContentApprovalReceiptType = {
      id: crypto.randomUUID(),
      toolName,
      binding: verifiedBinding(binding),
      status: 'pending',
      requestedAt: new Date().toISOString(),
      expiresAt,
      used: false,
    };
    this.write(receipt);
    return receipt;
  }

  get(id: string): ContentApprovalReceiptType | undefined {
    this.assertOpen();
    const row = this.db.prepare(
      'SELECT * FROM content_approval_receipts WHERE id = ?',
    ).get(id) as ReceiptRow | undefined;
    return row ? rowToReceipt(row) : undefined;
  }

  check(
    id: string,
    toolName: string,
    binding: ContentApprovalBindingType,
  ): ContentApprovalCheck {
    const receipt = this.get(id);
    if (!receipt) return { valid: false, reason: 'Content approval not found' };
    if (receipt.used) return { valid: false, receipt, reason: 'Content approval already used' };
    if (expired(receipt)) return { valid: false, receipt, reason: 'Content approval expired' };
    if (receipt.status === 'pending') return { valid: false, receipt, reason: 'Content approval pending' };
    if (receipt.status === 'rejected') return { valid: false, receipt, reason: 'Content approval rejected' };

    const proposed = verifiedBinding(binding);
    if (receipt.toolName !== toolName || receipt.binding.bindingHash !== proposed.bindingHash) {
      return { valid: false, receipt, reason: 'CONTENT_APPROVAL_BINDING_MISMATCH' };
    }
    return { valid: true, receipt };
  }

  approve(id: string, operator: OperatorIdentity): ContentApprovalReceiptType | undefined {
    this.assertOpen();
    const receipt = this.get(id);
    if (!receipt || receipt.used || receipt.status === 'rejected' || expired(receipt)) return undefined;
    const timestamp = new Date().toISOString();
    const changed = this.db.prepare([
      'UPDATE content_approval_receipts',
      'SET status = ?, approved_by = ?, approved_by_session_id = ?, approved_at = ?',
      'WHERE id = ? AND status = ? AND used = 0',
    ].join('\n')).run(
      'approved',
      operator.operatorId,
      operator.sessionId,
      timestamp,
      id,
      'pending',
    );
    return changed.changes === 1 ? this.get(id) : undefined;
  }

  reject(id: string, operator: OperatorIdentity): ContentApprovalReceiptType | undefined {
    this.assertOpen();
    const receipt = this.get(id);
    if (!receipt || receipt.used || receipt.status === 'approved' || expired(receipt)) return undefined;
    const timestamp = new Date().toISOString();
    const changed = this.db.prepare([
      'UPDATE content_approval_receipts',
      'SET status = ?, rejected_by = ?, rejected_by_session_id = ?, rejected_at = ?',
      'WHERE id = ? AND status = ? AND used = 0',
    ].join('\n')).run(
      'rejected',
      operator.operatorId,
      operator.sessionId,
      timestamp,
      id,
      'pending',
    );
    return changed.changes === 1 ? this.get(id) : undefined;
  }

  consume(id: string): void {
    this.assertOpen();
    this.db.prepare([
      'UPDATE content_approval_receipts',
      'SET used = 1',
      'WHERE id = ? AND status = ? AND used = 0',
    ].join('\n')).run(id, 'approved');
  }

  pending(): ContentApprovalReceiptType[] {
    this.assertOpen();
    const rows = this.db.prepare([
      'SELECT * FROM content_approval_receipts',
      'WHERE status = ? AND used = 0 AND expires_at > ?',
      'ORDER BY requested_at ASC',
    ].join('\n')).all('pending', new Date().toISOString()) as ReceiptRow[];
    return rows.map(rowToReceipt);
  }

  close(): void {
    this.closed = true;
    this.db.close();
  }

  private write(receipt: ContentApprovalReceiptType): void {
    this.db.prepare([
      'INSERT INTO content_approval_receipts (',
      '  id, tool_name, binding, status, requested_at,',
      '  approved_by, approved_by_session_id, approved_at,',
      '  rejected_by, rejected_by_session_id, rejected_at, expires_at, used',
      ') VALUES (',
      '  @id, @toolName, @binding, @status, @requestedAt,',
      '  @approvedBy, @approvedBySessionId, @approvedAt,',
      '  @rejectedBy, @rejectedBySessionId, @rejectedAt, @expiresAt, @used',
      ')',
    ].join('\n')).run({
      id: receipt.id,
      toolName: receipt.toolName,
      binding: JSON.stringify(receipt.binding),
      status: receipt.status,
      requestedAt: receipt.requestedAt,
      approvedBy: receipt.approvedBy ?? null,
      approvedBySessionId: receipt.approvedBySessionId ?? null,
      approvedAt: receipt.approvedAt ?? null,
      rejectedBy: receipt.rejectedBy ?? null,
      rejectedBySessionId: receipt.rejectedBySessionId ?? null,
      rejectedAt: receipt.rejectedAt ?? null,
      expiresAt: receipt.expiresAt,
      used: receipt.used ? 1 : 0,
    });
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('SqliteContentApprovalStore is closed');
  }
}
