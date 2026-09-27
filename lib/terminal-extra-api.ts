import { cachedTransport } from './cached-transport'
import TerminalExtraData from '../public/terminal-extra-data.js'

// One shared instance per server process (its caches protect Yahoo, Treasury and CFTC from bursts).
export const extra = TerminalExtraData.create(cachedTransport())
