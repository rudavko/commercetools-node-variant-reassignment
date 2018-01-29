import { expect } from 'chai'
import * as utils from '../../utils/helper'
import VariantReassignment from '../../../lib/runner/variant-reassignment'
import { PRODUCT_ANONYMIZE_SLUG_KEY } from '../../../lib/constants'

/* eslint-disable max-len */
/**
 * +-----------------------------------------+--------------------------+--------------------+--------------------------------------------------------------+
 * | New product draft                       | CTP product              | After reassignment | CTP product                                                  |
 * +-----------------------------------------+--------------------------+                    +--------------------------------------------------------------+
 * | Product:                                | Product:                 |                    | Product:                                                     |
 * | slug: { en: "product", de: "produkte" } | id: "1"                  |                    | id: "1"                                                      |
 * | product-type: "pt1"                     | slug: { en: "product" }  |                    | slug: { en: "product" }                                      |
 * | masterVariant: v1                       | product-type: "pt1"      |                    | product-type: "pt1"                                          |
 * | variants: v3                            | masterVariant: v1        |                    | masterVariant: v1                                            |
 * |                                         | variants: v2             |                    | variants: v3                                                 |
 * +-----------------------------------------+--------------------------+                    +--------------------------------------------------------------+
 * |                                         | Product:                 |                    | Product:                                                     |
 * |                                         | id: "2"                  |                    | id: "2"                                                      |
 * |                                         | slug: { de: "produkte" } |                    | slug: { de: "produkte_${timestamp}", ctsd: "${timestamp}" }  |
 * |                                         | product-type: "pt1"      |                    | product-type: "pt1"                                          |
 * |                                         | masterVariant: v3        |                    | masterVariant: v4                                            |
 * |                                         | variants: v4             |                    |                                                              |
 * +-----------------------------------------+--------------------------+--------------------+--------------------------------------------------------------+
 * |                                         |                          |                    | Product:                                                     |
 * |                                         |                          |                    | id: "3"                                                      |
 * |                                         |                          |                    | slug: { en: "produkte_${timestamp}", ctsd: "${timestamp}" }  |
 * |                                         |                          |                    | product-type: "pt1"                                          |
 * |                                         |                          |                    | variants: v2                                                 |
 * +-----------------------------------------+--------------------------+--------------------+--------------------------------------------------------------+
 */
/* eslint-enable max-len */
describe('Variant reassignment', () => {
  const logger = utils.createLogger(__filename)
  let ctpClient
  let product1
  let product2
  const enSlug = 'product'
  const deSlug = 'produkte'

  before(async () => {
    ctpClient = await utils.createClient()
    const results = await utils.createCtpProducts([['1', '2'], ['3', '4']], ctpClient, (pD) => {
      if (pD.masterVariant.sku === '1')
        pD.slug.en = enSlug
      else if (pD.masterVariant.sku === '3')
        pD.slug.de = deSlug
    })
    product1 = results.find(product => product.masterVariant.sku === '1')
    product2 = results.find(product => product.masterVariant.sku === '3')
  })

  after(() =>
    utils.deleteResourcesAll(ctpClient, logger)
  )

  it('merge variants v1 and v3 + remove variants v2 and v4', async () => {
    const reassignment = new VariantReassignment(ctpClient, logger)
    await reassignment.execute([{
      productType: {
        id: product1.productType.id
      },
      name: {
        en: 'Sample product1'
      },
      slug: {
        en: enSlug,
        de: deSlug
      },
      masterVariant: {
        sku: '1'
      },
      variants: [
        {
          sku: '3'
        }
      ]
    }])

    const { body: { results } } = await utils.getProductsBySkus(['1', '2', '3', '4'], ctpClient)
    expect(results).to.have.lengthOf(3)
    const updatedProduct1 = results.find(product => product.masterVariant.sku === '1'
      || product.masterVariant.sku === '3')
    expect(updatedProduct1.variants).to.have.lengthOf(1)
    expect(updatedProduct1.id).to.equal(product1.id)
    expect(updatedProduct1.slug.en).to.equal(enSlug)
    expect(updatedProduct1.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.an('undefined')

    const updatedProduct2 = results.find(product => product.masterVariant.sku === '4')
    expect(updatedProduct2.variants).to.have.lengthOf(0)
    expect(updatedProduct2.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.a('string')
    expect(updatedProduct2.id).to.equal(product2.id)

    const newProduct = results.find(product => product.masterVariant.sku === '2')
    expect(newProduct.variants).to.have.lengthOf(0)
    expect(newProduct.slug[PRODUCT_ANONYMIZE_SLUG_KEY]).to.be.a('string')
  })
})
