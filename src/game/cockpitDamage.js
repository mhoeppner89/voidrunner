// Stable fractures follow hull integrity; repairs and a new ship restore the glass.
export function cockpitDamageStage(hullFraction) {
 if(!Number.isFinite(hullFraction))return 0;
 return hullFraction<.1?4:hullFraction<.25?3:hullFraction<.5?2:hullFraction<.75?1:0;
}
export const CANOPY_APERTURES={
 wayfarer:'200,120 800,120 890,240 900,480 810,630 190,630 100,480 110,240',
 talon:'180,100 820,100 920,270 920,480 840,620 160,620 80,480 80,270',
 vanguard:'200,130 800,130 875,230 890,540 810,635 190,635 110,540 125,230',
 prospector:'200,120 800,120 905,290 900,490 820,625 180,625 100,490 95,290',
 lancer:'205,100 795,100 890,330 875,480 805,625 195,625 125,480 110,330',
 atlas:'200,140 800,140 835,210 835,555 805,620 195,620 165,555 165,210',
};
export function cockpitDamageMarkup() {
 return `<svg class="cockpit-damage" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
 <defs><clipPath id="canopy-aperture"><polygon class="canopy-aperture" points="${CANOPY_APERTURES.wayfarer}"/></clipPath><mask id="canopy-damage-mask" maskUnits="userSpaceOnUse"><rect width="1000" height="660" fill="white"/><image class="canopy-art-mask" width="1000" height="1000" preserveAspectRatio="none" href="./assets/remaster/cockpit-frame.webp" filter="url(#canopy-opaque)"/></mask><filter id="canopy-opaque"><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter></defs>
 <g clip-path="url(#canopy-aperture)" mask="url(#canopy-damage-mask)" fill="none" stroke-linejoin="miter">
 <g class="fracture fracture-1"><path d="M80 210L141 253 158 295 211 327 226 369M141 253L183 247 202 218M158 295L119 314 102 352M211 327L243 318 268 340M898 140L861 194 877 235 843 267 811 278M861 194L821 190 794 161M877 235L910 261 919 295"/></g>
 <g class="fracture fracture-2"><path d="M102 352L163 391 176 448 215 470 228 527M163 391L209 375 254 389 286 371M176 448L143 468 128 509M226 369L254 389 272 438 304 460M811 278L773 312 783 359 748 385 723 416M783 359L831 386 855 428M773 312L736 296 710 306M215 470L252 489 271 535"/></g>
 <g class="fracture fracture-3"><path d="M80 210L119 314 163 391 143 468 105 506 81 574M119 314L93 378 121 416 143 468M898 140L910 261 877 321 891 377 855 428 895 481M877 321L831 386M228 527L189 546 169 591M723 416L758 443 765 492 804 520M758 443L715 466 690 507"/><path class="glass-shard" d="M80 210L119 314 93 378 75 330ZM93 378L121 416 143 468 105 506 112 444ZM898 140L910 261 877 321 888 257ZM831 386L877 321 891 377 855 428Z"/></g>
 <g class="fracture fracture-4"><path d="M81 574L150 561 169 591 241 605 290 583M804 520L835 541 859 590 912 574M202 218L238 187 248 148 294 121M794 161L755 127 717 139 686 105"/><path class="glass-shard" d="M105 506L143 468 176 448 159 486ZM855 428L891 377 895 481 877 453Z"/></g></g></svg>`;
}
