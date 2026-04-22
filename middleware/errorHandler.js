module.exports = (err, req, res, next) => {
  console.error("[FocusDo Error]", err.message);
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
};
