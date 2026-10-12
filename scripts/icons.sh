#!/usr/bin/env bash
# Render every PNG icon from the SVG master (assets/icon.svg). Run after
# editing the icon. Android 8+ uses the vector adaptive icon in
# android/app/src/main/res/drawable/ directly; keep its shapes in sync.
#
#   scripts/icons.sh
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/icons.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

SHARP="npx --yes sharp-cli@6.1.0"
master="$HCP_ROOT/assets/icon.svg"
background='<rect width="108" height="108" fill="#171a21"/>'
if ! grep -qF "$background" "$master" || ! grep -qF '<g id="art">' "$master"; then
  hcp_die "assets/icon.svg must keep its background rect and <g id=\"art\"> (the variants below rewrite them)"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Variants of the master. The master's artwork is sized for Android's adaptive
# icon, whose mask crops the outer third; icons that aren't cropped like that
# scale it up so the phone fills a similar share.
grow='<g id="art" transform="translate(54 54) scale(1.3) translate(-54 -54)">'
sed -e "s|$background|<rect width=\"108\" height=\"108\" rx=\"24\" fill=\"#171a21\"/>|" -e "s|<g id=\"art\">|$grow|" "$master" > "$tmp/rounded.svg"
sed -e "s|$background|<circle cx=\"54\" cy=\"54\" r=\"54\" fill=\"#171a21\"/>|" -e "s|<g id=\"art\">|$grow|" "$master" > "$tmp/round.svg"
sed -e "s|<g id=\"art\">|$grow|" "$master" > "$tmp/maskable.svg"

# render <svg> <size> <out.png>: rasterise at the target size (not upscaled).
render() {
  local density
  density=$(awk "BEGIN { printf \"%d\", 72 * $2 / 108 + 1 }")
  $SHARP --density "$density" -i "$1" -o "$3" resize "$2" "$2" > /dev/null
}

hcp_say "Web app icons"
cp "$tmp/rounded.svg" "$HCP_ROOT/public/icon.svg"
render "$tmp/rounded.svg" 192 "$HCP_ROOT/public/icon-192.png"
render "$tmp/rounded.svg" 512 "$HCP_ROOT/public/icon-512.png"
render "$tmp/maskable.svg" 512 "$HCP_ROOT/public/icon-maskable-512.png" # full bleed; the OS masks it

hcp_say "Android launcher icons for Android 7 and older"
res="$HCP_ROOT/android/app/src/main/res"
for pair in ldpi:36 mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  dpi=${pair%%:*} size=${pair##*:}
  render "$tmp/rounded.svg" "$size" "$res/mipmap-$dpi/ic_launcher.png"
  render "$tmp/round.svg" "$size" "$res/mipmap-$dpi/ic_launcher_round.png"
done

hcp_say "Done"
