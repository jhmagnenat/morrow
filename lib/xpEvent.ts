// Fired client-side after any card grade, so the always-mounted XpBar can
// refetch without polling. Cheap custom-event broadcast rather than prop
// drilling the XP state through every study-mode tab.
export const XP_UPDATED_EVENT = "xp-updated";

export function notifyXpUpdated() {
  window.dispatchEvent(new Event(XP_UPDATED_EVENT));
}
