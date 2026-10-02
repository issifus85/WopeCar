// Imperative bridge between paystackCheckout.js (a plain service function,
// not a component) and components/PaystackWebViewModal.js (mounted once in
// app/_layout.js). Lets payWithPaystack() stay a simple awaited promise -
// same shape as the web popup-polling branch - while the actual UI lives in
// the component tree, the way a WebView requires.
let showModal = null;

export function registerPaystackWebView(fn) {
  showModal = fn;
}

export function openPaystackWebView(authUrl, callbackUrlPrefix) {
  if (!showModal) return Promise.resolve({ type: 'cancel' });
  return showModal(authUrl, callbackUrlPrefix);
}
