const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { createRateLimiter } = require('../middleware/rateLimiter.middleware');

const authLimiter = createRateLimiter({ max: 10, windowMs: 60 * 1000 });
const strictLimiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and token management
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Creates a new account and sends a verification email. Login requires email verification when REQUIRE_EMAIL_VERIFICATION=true.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "securePass1!"
 *               role:
 *                 type: string
 *                 enum: [CUSTOMER, MERCHANT_OWNER]
 *                 default: CUSTOMER
 *                 description: Public registration never accepts platform/admin roles.
 *               tenantName:
 *                 type: string
 *                 example: "Acme Commerce"
 *               merchantName:
 *                 type: string
 *                 example: "Acme Retail Ltd"
 *               phone:
 *                 type: string
 *                 example: "+1-555-0100"
 *               address:
 *                 type: string
 *                 example: "123 Commerce St"
 *     responses:
 *       201:
 *         description: User registered — verification email sent
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already registered
 *       429:
 *         description: Too many requests
 */
router.post('/register', authLimiter, authController.register);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email address
 *     description: Validates the token from the verification email and activates the account.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "a3f1c9d2e8b7..."
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 *       429:
 *         description: Too many requests
 */
router.post('/verify-email', strictLimiter, authController.verifyEmail);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive access + refresh tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: "securePass1!"
 *     responses:
 *       200:
 *         description: Returns accessToken, refreshToken, and user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: Short-lived JWT (15 minutes)
 *                 refreshToken:
 *                   type: string
 *                   description: Long-lived token (7 days), store securely
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified (when REQUIRE_EMAIL_VERIFICATION=true)
 *       429:
 *         description: Too many requests
 */
router.post('/login', authLimiter, authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange a refresh token for a new access token and rotated refresh token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *                   description: Replacement refresh token; the submitted token is revoked.
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke refresh token (logout)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     responses:
 *       200:
 *         description: JWT payload of the current user
 *       401:
 *         description: Unauthorized — no or invalid token
 */
router.get('/me', authenticate, authController.me);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     description: Sends a password reset link to the email address if it is registered. Always returns 200 to prevent account enumeration.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Reset email sent (if address is registered)
 *       429:
 *         description: Too many requests
 */
router.post('/forgot-password', strictLimiter, authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using email token
 *     description: Sets a new password using the token from the reset email. All active sessions are revoked.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "a3f1c9d2e8b7..."
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: "NewSecurePass456!"
 *     responses:
 *       200:
 *         description: Password reset — all sessions revoked
 *       400:
 *         description: Invalid/expired token or weak password
 *       429:
 *         description: Too many requests
 */
router.post('/reset-password', strictLimiter, authController.resetPassword);

/**
 * @swagger
 * /auth/password:
 *   patch:
 *     tags: [Auth]
 *     summary: Change password (revokes all active sessions)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "OldPass123!"
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: "NewSecurePass456!"
 *     responses:
 *       200:
 *         description: Password changed, all sessions revoked
 *       400:
 *         description: Missing fields or password too short
 *       401:
 *         description: Current password incorrect
 */
router.patch('/password', authenticate, authController.changePassword);

module.exports = router;
