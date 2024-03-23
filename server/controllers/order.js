'use strict'
const HttpStatus = require('http-status-codes')
const { Results, OrderStatus } = require('../common/typedefs')
const { ObjectId } = require('mongodb')
const Item = require('../common/models/item')
const Order = require('../common/models/order')
const AdminController = require('./admin-controls')
const PaymentsController = require('./payments')
// Controller for Order related methods

/**
 * Middleware function to create new order
 * @param {Request} req.body.itemsList - The list of items in format: [{itemId, itemQty}]
 * @returns Creates order and generates payment invoice for newly created order
 */
exports.createNewOrder = (req, res, next) => {
  try {
    const userId = req.userId
    const itemsList = req.body.itemsList
    let orderValueInPaiseBeforeDiscount = 0
    let orderValueInPaiseAfterDiscount = 0
    let discountAmount = 0
    const orderId = new ObjectId() // This needs to be passed to createDiscountCode method before creating an order, so have it generated beforehand

    if (!itemsList?.length) {
      throw new Error('Failed to create order. No items found')
    }

    // Fetch price of each item from database and check if available quantity > 0
    Item.aggregate([
      {
        $match: {
          _id: { $in: itemsList.map((item) => item.itemId) }, // Filter for items in the list
        },
      },
      {
        $project: {
          _id: 1,
          availableQty: 1,
          priceInPaise: 1,
          itemName: 1,
        },
      },
    ])
      .then((dbItemsList) => {
        if (!dbItemsList?.length) {
          throw new Error('Items not found')
        }

        /**
        Check if the quantity user has entered is available in store or not, and calculate the total price for each item here, don't trust any value from frontend
        */

        itemsList.forEach((item) => {
          const dbItem = dbItemsList.find((dbItem) =>
            dbItem._id.equals(item._id),
          )
          if (dbItem?.availableQty < item.itemQty) {
            // This can be handled in different ways, but for simplicity, let's throw an error
            throw new Error(
              `Only ${dbItem.availableQty} units of ${dbItem.itemName} are left`,
            )
          }

          orderValueInPaiseBeforeDiscount += dbItem.priceInPaise * itemQty
        })

        // Get existing document count of orders collection
        return Order.countDocuments()
      })
      .then((existingOrdersCount) => {
        /**
         Check if this order is eligible for discount, whether this is nth order
         */

        const currentOrderCount = existingOrdersCount + 1 // The current order being placed is existingOrdersCount + 1
        if (currentOrderCount % process.env.NTH_ORDER_COUNT == 0) {
          const discountPercent = 10
          discountAmount = 0.1 * orderValueInPaiseBeforeDiscount // Apply 10% discount
          orderValueInPaiseAfterDiscount =
            orderValueInPaiseBeforeDiscount - discountAmount

          // Generate discount code for this order
          return AdminController.createDiscountCodeHelper(
            orderId,
            discountPercent,
            discountAmount,
          )
        } else {
          orderValueInPaiseAfterDiscount = orderValueInPaiseBeforeDiscount
        }
      })
      .then((discountCode) => {
        /**
        At this point we have all the field values needed to create an order, whether discount needs to be applied or not, discountCode will have some value or will be undefined. Now, create new order.
        */

        // Shred everything after 2 decimal places
        orderValueInPaiseAfterDiscount =
          orderValueInPaiseAfterDiscount.toFixed(2)
        orderValueInPaiseBeforeDiscount =
          orderValueInPaiseBeforeDiscount.toFixed(2)

        const order = new Order({
          _id: orderId,
          userId: ObjectId(userId),
          status: OrderStatus.CREATED,
          createdOn: new Date(),
          itemsPurchased: itemsList,
          orderValueInPaiseAfterDiscount,
          orderValueInPaiseBeforeDiscount,
          discountAmount,
          discountCode,
        })

        return order.save()
      })
      .then(() => {
        /**
         Since this is an e-commerce application, let's call generateInvoice API (out of current scope, per se), for which client will make payment
        */

        return PaymentsController.generateInvoice(
          orderId,
          orderValueInPaiseAfterDiscount,
        )
      })
      .then((invoiceId) => {
        /** 
         Now send the invoice back to client for them to make payment and place the order
         */
        console.log(
          'Created order successfully, sending invoice to user',
          invoiceId,
        )
        res.status(HttpStatus.StatusCodes.OK).json({
          orderId,
          invoiceId,
          orderValueInPaiseAfterDiscount,
          orderValueInPaiseAfterDiscount,
          discountAmount,
        })
      })
  } catch (error) {
    console.error(error)
    res.status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR).json({ error })
  }
}