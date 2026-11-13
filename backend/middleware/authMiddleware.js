
import jwt from 'jsonwebtoken';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('JWT_SECRET is not configured.');

    return res.status(500).json({
      success: false,
      message: 'Authentication service is not configured.',
    });
  }

  try {
    const decoded = jwt.verify(token, secret);

    if (
      typeof decoded !== 'object' ||
      !decoded.userId ||
      typeof decoded.userId !== 'string'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Your session is invalid or expired. Please log in again.',
    });
  }
}
