const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

require('dotenv').config();
const fs = require('fs');

const { Network, Alchemy, Wallet, Utils , ethers  } = require("alchemy-sdk");


const userBackup = require('./backups/users.json')

const express =  require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');


const PORT = process.env.PORT || 3000;

const app = express();


app.use(helmet());
app.use(morgan('tiny'));
app.use(cors());
app.use(express.json()); //accepting only json data


//  Make Sure to Update the .env filr with your credentials

const url = `https://eth-goerli.g.alchemy.com/v2/${process.env.API_KEY}`;
const PRIVATE_KEY = process.env.PRIVATE_KEY

const settings = {
    apiKey: process.env.API_KEY,
    network: Network.ETH_GOERLI,
};

const alchemy = new Alchemy(settings);  
const wallet = new Wallet(PRIVATE_KEY);


// The Mapping of Address => lastClaimedTime
const faucetClaimers =  new Map(Object.entries(userBackup));

// faucetClaimers.set('test', 1234);

let claimIntervalInSeconds = 84000


app.get('/', (req,res)=>{
    test();
    res.json({
        message: 'Welcome to My Api'
    })


}) 


// The Function for sending Transaction
const sendTransaction = async ( receiverAddress, res) =>{

    let maxPriorityFeePerGas;

    const options = {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_maxPriorityFeePerGas',
        }),
      };

    maxPriorityFeePerGas = await fetch(url, options)
    .then((res) => res.json())
    .then((json) => json.result)
    .catch((err) => console.error('error:' + err));

    console.log(maxPriorityFeePerGas);


    const transaction = {
        to: receiverAddress,
        value: Utils.parseEther("0.001"),
        gasLimit: "3000000",
        maxPriorityFeePerGas: await maxPriorityFeePerGas,
        maxFeePerGas: await alchemy.core.getGasPrice(),
        nonce: await alchemy.core.getTransactionCount(wallet.getAddress()),
        type: 2,
        chainId: 5, //  ETH_GOERLI
      };
    

  const rawTransaction = await wallet.signTransaction(transaction);
  let data = await alchemy.transact.sendTransaction(rawTransaction);



  console.log("Check your Transaction hash at :", `https://goerli.etherscan.io/tx/${data.hash}`);

  const lastClaimed = Date.now();

  faucetClaimers.set(receiverAddress, lastClaimed);

  console.log(faucetClaimers);

//   res.send(`Check your Transaction hash at : https://goerli.etherscan.io/tx/${data.hash}`)
  res.json({ hash: `${data.hash}`});

}


// Checks if the Required timespan has passed or not
const timeEligibilityCheck = (receiverAddress) =>{
    // console.log('receiverAddress: ', receiverAddress);
    let lastUpdatedTime ;


    // console.log(faucetClaimers.get(receiverAddress));
    // console.log(faucetClaimers);
    if(faucetClaimers.get(receiverAddress) == 0 ||faucetClaimers.get(receiverAddress) == undefined ){
        return true;

    } else {
        lastUpdatedTime = Math.floor(faucetClaimers.get(receiverAddress)/1000.0)
    }

    
    let CurrentTime = Math.floor(new Date().getTime()/1000.0)

    // console.log((CurrentTime - lastUpdatedTime) > claimIntervalInSeconds);

    return (CurrentTime - lastUpdatedTime) > claimIntervalInSeconds

}


// To get the wallet and proceed the transaction

app.post('/sendEther', (req,res,next)=>{

    if(!req.body.receiverAddress) return res.send("INVALID")

    let _receiverAddress = req.body.receiverAddress
    console.log('req.body.receiverAddress: ', req.body.receiverAddress);

    if(!timeEligibilityCheck(_receiverAddress)) return res.send("TIME_LIMIT")


    console.log('receiver:', _receiverAddress);


    try{

        sendTransaction( _receiverAddress , res);


    }catch(error){

    next(error);

    }

    
}) 


// for getting the Last Claimed Data of a Wallet

app.get('/getLastClaimed/:walletAddress', (req,res,next)=>{
    const walletAddress = req.params.walletAddress;
    console.log(walletAddress);
    if (!faucetClaimers.has(walletAddress)) {
        res.send("0")

    } else {
        res.send(`${faucetClaimers.get(walletAddress)}`)
        
    }


});


// Handling Errors
app.use((error,req,res,next) => {
    if(error.status){
        res.status(error.status);
    } else {
        res.status(500);
    }
    res.json({
        message: error.message,
        stack: error.stack
    })
})


// Save a Backup of FaucetClaimers Map as a JSON File.
const saveBackup = () => {

    fs.writeFile('./backups/users.json', JSON.stringify(Object.fromEntries(faucetClaimers)), (err) => {  
        // Catch this!
        if (err) throw err;
    
        // console.log('Users saved!');
    });

}

// Save Every X minutes
const interval = setInterval(saveBackup, 60000);



app.listen(PORT, ()=>{
    console.log(`Listening at http://localhost:${PORT}`);
})

