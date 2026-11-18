// API badges use unpadded filenames; the local artwork uses 000.png–023.png.
export function clanBadgePath(badge) {
  if (!badge || typeof badge !== "object") return null;
  const values = [badge.file, badge.id, badge.name];
  for (const value of values) {
    if (value == null || typeof value === "boolean") continue;
    const match = String(value).match(/^(?:clan_icon_)?(\d{1,3})(?:\.png)?$/i);
    if (!match) continue;
    const id = Number(match[1]);
    if (id >= 0 && id <= 23)
      return "assets/badges/" + String(id).padStart(3, "0") + ".png";
  }
  return null;
}
