function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: { message: "Route not found." }
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      message: statusCode >= 500 ? "Server error while processing the request." : error.message,
      ...(error.code ? { code: error.code } : {})
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
