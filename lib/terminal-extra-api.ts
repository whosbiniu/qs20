import TerminalData from '../public/terminal-data.js'
import TerminalExtraData from '../public/terminal-extra-data.js'

// One shared instance per server process (its caches protect Yahoo, Treasury and CFTC from bursts).
export const extra = TerminalExtraData.create(TerminalData.nodeTransport())
