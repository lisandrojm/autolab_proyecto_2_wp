const mongoose = require('mongoose');
const { Order } = require('./server/dist/models/Order.js');
// Need to connect to db to read orders
mongoose.connect('mongodb://localhost:27017/autolab_proyecto_2_wp_db', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    // try to use the raw collection if you don't know the exact db name
  }).catch(err => console.error(err));
