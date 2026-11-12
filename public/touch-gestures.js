// Keep browser page zoom separate from the map's own touch handling.
(() => {
 if (!navigator.maxTouchPoints) return;
 const preventPageGesture = event => {
  if (event.cancelable) event.preventDefault();
 };
 // Safari exposes browser pinch gestures separately from touch events.
 document.addEventListener('gesturestart', preventPageGesture, {passive:false});
 document.addEventListener('gesturechange', preventPageGesture, {passive:false});
 document.addEventListener('touchmove', event => {
  if (event.touches.length < 2) return;
  // Let Google Maps / Leaflet receive their original multitouch events.
  if (event.target instanceof Element && event.target.closest('#map')) return;
  preventPageGesture(event);
 }, {passive:false});
})();
