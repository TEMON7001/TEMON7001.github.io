// Адаптер протокола: то, что ядро получает снаружи и через что говорит с J1939.
// Когда после MVP появится OBD-II, рядом ляжет второй такой файл, а ядро не изменится.

import { parseId, buildId, parseRequestedPgn, pgnToHex, GLOBAL_ADDRESS } from "./id.js";

export const j1939 = {
  id: "j1939",
  name: "SAE J1939",
  catalogUrl: "data/j1939-pgn.json",
  faultCodesUrl: "data/fmi.json",
  globalAddress: GLOBAL_ADDRESS,
  parseId,
  buildId,
  parseRequestedPgn,
  pgnToHex,
};

export default j1939;
