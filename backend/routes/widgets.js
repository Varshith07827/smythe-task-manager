const router = require('express').Router();
const widgetController = require('../controllers/widgetController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/check-embed', widgetController.checkEmbed);
router.post('/', widgetController.create);
router.get('/', widgetController.getAll);
router.patch('/:id', widgetController.update);
router.delete('/:id', widgetController.delete);

module.exports = router;
