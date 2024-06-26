'use strict'
const HttpStatus = require('http-status-codes')
const DiscountCode = require('../common/models/discount-code')
const { ObjectId } = require('mongodb')
const Item = require('../common/models/item')
const Order = require('../common/models/order')
const { Results, DiscountCodeStatus } = require('../common/typedefs')

// Controller for admin-only methods

/**
 * An internal (unexposed) helper function to create new discount code. If discount percentage is not passed, 10% will be default value
 * @param {Number} discountPercent - The discount in percentage being applied
 * @returns {Promise<String>} Discount Code (String)
 */
exports.createDiscountCodeHelper = (discountPercent = 10) => {
  /** 
   This method is called internally and by design it is not part of any route middleware, so only server can access it, hence there is no need to explicitly verify that user is admin or not
  */

  return new Promise((resolve, reject) => {
    try {
      // Generate discount code
      const discountCode = new DiscountCode({
        discountPercent,
        status: DiscountCodeStatus.ACTIVE,
      })

      discountCode
        .save()
        .then((newDiscountCode) => {
          console.log('Discount code created', newDiscountCode._id.toString())
          resolve(newDiscountCode._id.toString())
        })
        .catch((error) => {
          console.error(error)
          reject(error)
        })
    } catch (error) {
      console.error(error)
      reject(error)
    }
  })
}

/**
 * Route middleware (Admin-only) to create new discount code using the helper function
 * @param {Number} discountPercent - The discount in percentage being applied
 * @returns Discount Code (String)
 */
exports.createDiscountCode = (req, res, next) => {
  try {
    // Only admin access is allowed to this API
    if (!req.userIsAdmin) {
      throw new Error('User unathorized to perform this action')
    }

    // Generate discount code using helper
    this.createDiscountCodeHelper()
      .then((discountCode) => {
        req.discountCode = discountCode
        next()
      })
      .catch((error) => {
        console.error(error)
        res
          .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ error: Results.INTERNAL_SERVER_ERROR })
      })
  } catch (error) {
    console.error(error)
    res
      .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: Results.INTERNAL_SERVER_ERROR })
  }
}

/**
 * Route middleware (Admin-only) to list count of items purchased
 * @returns List of items purchased in the form: [{itemName, purchasedCount}]
 */
exports.getItemsPurchasedList = (req, res, next) => {
  try {
    // Only admin access is allowed to this API
    if (!req.userIsAdmin) {
      throw new Error('User unathorized to perform this action')
    }

    // Get all items from database along with their name, id and purchasedCount
    Item.find({}, { _id: 1, itemName: 1, purchasedCount: 1 })
      .then((items) => {
        res.status(HttpStatus.StatusCodes.OK).json({ items })
      })
      .catch((error) => {
        console.error(error)
        res
          .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ error: Results.INTERNAL_SERVER_ERROR })
      })
  } catch (error) {
    console.error(error)
    res
      .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: Results.INTERNAL_SERVER_ERROR })
  }
}

/**
 * Route middleware (Admin-only) to get total purchased amount
 * @returns Total purchased amount (Number)
 */
exports.getTotalPurchaseAmount = (req, res, next) => {
  try {
    // Only admin access is allowed to this API
    if (!req.userIsAdmin) {
      throw new Error('User unathorized to perform this action')
    }

    // For all orders in the database keep adding the value in field orderValueInPaiseAfterDiscount, and return the result
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalPurchaseAmount: { $sum: '$orderValueInPaiseAfterDiscount' },
        },
      },
    ]).toArray((error, result) => {
      if (error) {
        throw new Error(error)
      }

      if (!result.length || !result[0]?.totalPurchaseAmount) {
        throw new Error('Result missing total purchase amount')
      }

      res
        .status(HttpStatus.StatusCodes.OK)
        .json({ totalPurchaseAmount: result[0].totalPurchaseAmount })
    })
  } catch (error) {
    console.error(error)
    res
      .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: Results.INTERNAL_SERVER_ERROR })
  }
}

/**
 * Route middleware (Admin-only) to get list of all the discount codes
 * @returns List of all the existing discount codes
 */
exports.getDiscountCodesList = (req, res, next) => {
  try {
    // Only admin access is allowed to this API
    if (!req.userIsAdmin) {
      throw new Error('User unathorized to perform this action')
    }

    // As mentioned in design details of discount code schema, the _id created by mongoose is always unique, and hence it is the most convinient way to avoid hassle of generating unique codes manually
    DiscountCode.find({}, { _id: 1, discountPercent: 1, discountAmount: 1 })
      .then((disCountCodes) => {
        res.status(HttpStatus.StatusCodes.OK).json({ disCountCodes })
      })
      .catch((error) => {
        console.error(error)
        res
          .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ error: Results.INTERNAL_SERVER_ERROR })
      })
  } catch (error) {
    console.error(error)
    res
      .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: Results.INTERNAL_SERVER_ERROR })
  }
}

/**
 * Route middleware (Admin-only) to get total discount amount
 * @returns Total discount amount (Number)
 */
exports.getTotalDiscountAmount = (req, res, next) => {
  try {
    // Only admin access is allowed to this API
    if (!req.userIsAdmin) {
      throw new Error('User unathorized to perform this action')
    }

    // For all discount codes in the database keep adding the value in field discountAmount, and return the result
    DiscountCode.aggregate([
      {
        $group: {
          _id: null,
          totalDiscountAmount: { $sum: '$discountAmount' },
        },
      },
    ]).toArray((error, result) => {
      if (error) {
        throw new Error(error)
      }

      if (!result.length || !result[0]?.totalDiscountAmount) {
        throw new Error('Result missing total discount amount')
      }

      res
        .status(HttpStatus.StatusCodes.OK)
        .json({ totalDiscountAmount: result[0].totalDiscountAmount })
    })
  } catch (error) {
    console.error(error)
    res
      .status(HttpStatus.StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: Results.INTERNAL_SERVER_ERROR })
  }
}

/**
 * An internal (unexposed) helper function to validate user entered discount code.
 * @param {String} discountCode - The discount code entered by user
 * @returns Whether discount code is valid or not, if it is valid, return discountPercent offered by it.
 */
exports.validateDiscountCode = (discountCode) => {
  return new Promise((resolve, reject) => {
    DiscountCode.findOne(
      { _id: new ObjectId(discountCode) },
      { status: 1, discountPercent: 1 },
    )
      .then((discountCode) => {
        // If discount code does not exist, or is not active, discard it
        if (!discountCode || discountCode.status != DiscountCodeStatus.ACTIVE) {
          console.log('Invalid discount code')

          // IMP: The use of resolve is made instead of reject here, because, the invoice creation should not be discarded just because user entered an invalid code, hence, just discard the code and proceed further.
          return resolve({ validCode: false })
        }

        console.log('Valid discount code')
        return resolve({
          validCode: true,
          discountPercent: discountCode.discountPercent,
        })
      })
      .catch((error) => {
        console.error(error)

        // As stated above, failing to validate discount code is not fatal, invalidate the code and proceed further
        return resolve({ validCode: false })
      })
  })
}
