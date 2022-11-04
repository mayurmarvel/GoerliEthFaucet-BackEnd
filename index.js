require('dotenv').config();
const fs = require('fs');

const { Network, Alchemy, Wallet, Utils  } = require("alchemy-sdk");


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


    const transaction = {
        to: receiverAddress,
        value: Utils.parseEther("0.001"),
        gasLimit: "21000",
        maxPriorityFeePerGas: Utils.parseUnits("14", "gwei"),
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

    let lastUpdatedTime = Math.floor(faucetClaimers.get(receiverAddress)/1000.0)
    let CurrentTime = Math.floor(new Date().getTime()/1000.0)

    return (CurrentTime - lastUpdatedTime) > claimIntervalInSeconds

}


// To get the wallet and proceed the transaction

app.post('/sendEther', (req,res,next)=>{

    if(!req.body.receiverAddress) return res.send("INVALID")

    let receiverAddress = req.body.receiverAddress

    if(!timeEligibilityCheck(receiverAddress)) return res.send("TIME_LIMIT")


    console.log('receiver:', receiverAddress);


    try{

        sendTransaction( receiverAddress , res);


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
    
        console.log('Users saved!');
    });

}

// Save Every X minutes
const interval = setInterval(saveBackup, 60000);



app.listen(PORT, ()=>{
    console.log(`Listening at http://localhost:${PORT}`);
})

