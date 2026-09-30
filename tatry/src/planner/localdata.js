// everything personal this app keeps in the browser (settings like the graphics quality stay)
export function clearLocalData() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/^(rysy-journal|rysy-discoveries|tatry-|szlakownik-sos|sb-)/.test(k)) localStorage.removeItem(k);
    }
  } catch (e) { /* private mode */ }
}
