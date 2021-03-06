const BlockChain = require("./block-chain")
const topics = require("./mqtt-topics")
const BlockModel = require("./sequelize/block")
const Client = require("node-rest-client").Client
const moment = require("moment")

const features = new BlockChain()
const client = new Client()
const mqttClient = global.mqttClient

module.exports = () => {
  mqttClient.on("connect", () => {
    mqttClient.subscribe(topics.REQUEST_BLOCKCHAIN)
    mqttClient.subscribe(topics.BROADCAST_BLOCKCHAIN)
    mqttClient.subscribe(topics.REQUEST_BLOCKCHAIN_WEBAPP)
    mqttClient.subscribe(topics.REQUEST_LATEST_BLOCK)
    mqttClient.subscribe(topics.RESPONSE_NEW_BLOCK)
    mqttClient.publish(topics.REQUEST_BLOCKCHAIN, process.env.NODE_IP)
  })

  mqttClient.on("message", async (topic, message) => {
    let blockchain

    switch (topic) {
      case topics.REQUEST_BLOCKCHAIN:
        const nodeIP = message.toString()
        if (process.env.NODE_IP !== nodeIP) {
          require("debug")("REQUEST_BLOCKCHAIN")(nodeIP)
          blockchain = await features.getBlockchain()

          const value = {
            nodeIP,
            blockchain
          }
          mqttClient.publish(topics.BROADCAST_BLOCKCHAIN, JSON.stringify(value))
        }
        break

      case topics.BROADCAST_BLOCKCHAIN:
        const value = JSON.parse(message.toString())
        if (process.env.NODE_IP === value.nodeIP) {
          blockchain = await features.replaceBlockChain(value.blockchain)
          require("debug")("BROADCAST_BLOCKCHAIN")(blockchain)
          // Receive blockchain
          if (blockchain) {
            BlockModel.destroy({
              where: {},
              truncate: true
            }).then(() => {
              BlockModel.bulkCreate(blockchain)
            })
          }
        }
        break

      case topics.REQUEST_BLOCKCHAIN_WEBAPP:
        require("debug")("REQUEST_BLOCKCHAIN_WEBAPP")(message.toString())
        blockchain = await features.getBlockchain()
        mqttClient.publish(
          topics.BROADCAST_BLOCKCHAIN_WEBAPP,
          JSON.stringify(blockchain)
        )
        break

      case topics.REQUEST_LATEST_BLOCK:
        if (process.env.ALLOW_BROADCAST_LATEST_BLOCK == 1) {
          const block = await features.getLatestBlock()
          require("debug")("REQUEST_LATEST_BLOCK")(JSON.stringify(block))

          // Index for new block + previous block's hash + timestamp for new block
          const newBlockData =
            (block.index + 1).toString().padStart(2, 0) +
            block.hash +
            moment(new Date()).unix()

          setTimeout(() => {
            mqttClient.publish(topics.RESPONSE_LATEST_BLOCK, newBlockData, {
              qos: 1
            })
          }, 2000)
        }
        break

      case topics.RESPONSE_NEW_BLOCK:
        let newBlock = message.toString()
        // nonce_hash_data_timestamp
        newBlock = newBlock.split("_")
        newBlock = await features.newBlock(newBlock)
        const isBlockValid = await features.isValidBlock(newBlock)

        if (isBlockValid) {
          require("debug")("RESPONSE_NEW_BLOCK")(newBlock)
          newBlock.timestamp = parseInt(newBlock.timestamp) * 1000
          BlockModel.create(newBlock)

          // Notify rest service of new block
          const args = {
            data: newBlock,
            headers: { "Content-Type": "application/json" }
          }
          client.post(
            `http://${process.env.REST_SERVICE_IP}:5000/block`,
            args,
            (data, response) => {}
          )
        }
        break

      default:
        break
    }
  })
}
