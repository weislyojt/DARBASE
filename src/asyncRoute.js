/* Wraps an async route handler so a rejected promise becomes a normal
   Express error instead of an unhandled rejection that silently hangs the
   request. Every async route in this app goes through this. */
function wrap(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { wrap };
