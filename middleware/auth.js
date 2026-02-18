const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token, access denied'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token is not valid'
    });
  }
};

const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden: insufficient permissions'
      });
    }

    next();
  };
};

// Check Granular Permission or Role
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // 1. Check Role-based mapping (Optional: Define roles that typically have this permission)
    // For now, we rely on the specific 'permissions' array from the token or DB
    // But since the token might be old, strict systems re-fetch. 
    // We will use the token's permission array (req.user.permissions)

    // Note: Verify authMiddleware decodes permissions into req.user
    const userPermissions = req.user.permissions || [];

    if (userPermissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied: Requires '${permission}' permission`
    });
  };
};

module.exports = { authMiddleware, checkRole, checkPermission };
