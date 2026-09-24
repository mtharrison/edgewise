import { decoderChannels } from './actions'
import type { Channel, DecoderInst } from './types'

export const RULER_H = 32
export const CH_H = 44
export const DEC_H = 30

export type Row =
  | { kind: 'channel'; ch: Channel; y: number; h: number }
  | { kind: 'decoder'; dec: DecoderInst; row: number; label: string; y: number; h: number }

/** Visible rows, top to bottom. Decoder rows sit under the last channel they read. */
export function layoutRows(channels: Channel[], decoders: DecoderInst[]): Row[] {
  const rows: Row[] = []
  let y = 0
  const placed = new Set<number>()
  const visible = channels.filter((c) => c.visible)
  const lastVisible = visible[visible.length - 1]?.index ?? -1
  const addDecoder = (d: DecoderInst) => {
    placed.add(d.id)
    d.rows.forEach((label, row) => {
      rows.push({ kind: 'decoder', dec: d, row, label, y, h: DEC_H })
      y += DEC_H
    })
  }
  for (const ch of visible) {
    rows.push({ kind: 'channel', ch, y, h: CH_H })
    y += CH_H
    for (const d of decoders) {
      if (!d.visible || placed.has(d.id)) continue
      const last = Math.max(...decoderChannels(d.config).filter((i) => channels[i]?.visible), -1)
      if (last === ch.index || (last === -1 && ch.index === lastVisible)) addDecoder(d)
    }
  }
  for (const d of decoders) if (d.visible && !placed.has(d.id)) addDecoder(d)
  return rows
}
