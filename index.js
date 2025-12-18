require("dotenv").config();
const express = require("express");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [
      `${process.env.BASE_URL}`,
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("localchefbazar");
    const mealsColl = db.collection("meals");
    const usersColl = db.collection("users");
    const rolesColl = db.collection("roles");
    const reviewsColl = db.collection("reviews");
    const favoriteColl = db.collection("favorite");
    const ordersColl = db.collection("orders");

    // POST REQUESTS
    // meals
    app.post("/meals", async (req, res) => {
      const mealData = req.body;
      const result = await mealsColl.insertOne(mealData);
      res.send(result);
    });

    // users
    app.post("/users", async (req, res) => {
      const userData = req.body;
      const result = await usersColl.insertOne(userData);
      res.send(result);
    });

    // roles
    app.post("/roles", async (req, res) => {
      const userData = req.body;
      const existingRequest = await rolesColl.findOne({userEmail: userData.userEmail})
      if(existingRequest){
        return res.status(409).json({message: "Your request is being processed. Wait for approval!"})
      }
      const result = await rolesColl.insertOne(userData);
      res.send(result);
    });

    // reviews
    app.post("/review/:id", async (req, res) => {
      const reviewData = req.body;
      const id = req.params.id;

      const findMeal = await mealsColl.findOne({ _id: new ObjectId(id)});
      if (!findMeal) {
        return res.status(404).json({message: "Meal Not Found!"})
      }
      
      const existingReview = await reviewsColl.findOne({reviewerEmail: reviewData.reviewerEmail, foodId: id})
      if(existingReview){
        return res.status(409).json({message: "You have already reviewed this meal"})
      }
      const result = await reviewsColl.insertOne({...reviewData, foodId: id, date: new Date().toISOString()});
      res.send(result);
    });

    // favorite
    app.post("/favorite/:id", async (req, res) => {
      const favoriteData = req.body;
      const id = req.params.id;

      const find = await mealsColl.findOne({ _id: new ObjectId(id) });
      if (!find) {
        return res.status(404).json({ message: "Meal Not Found!" });
      }

      const existingFavorite = await favoriteColl.findOne({ mealId: id, userEmail: favoriteData.userEmail});
      if (existingFavorite) {
        return res
          .status(409)
          .json({ message: "Meal already exist in your favorite List" });
      }

      const result = await favoriteColl.insertOne({
        ...favoriteData,
        mealId: id,
        addedTime: new Date().toISOString(),
      });
      return res.send(result);
    });


    app.post('/orders', async(req, res)=>{
      const ordersData = req.body;
      const result = await ordersColl.insertOne({...ordersData, orderTime: new Date().toISOString()});
      res.send(result);
    })


    // GET REQUESTS
    // all meals
    app.get("/meals", async (req, res) => {
      const result = await mealsColl.find().toArray();
      res.send(result);
    });
    // single meal
    app.get("/meal/:id", async (req, res) => {
      const id = req.params.id;
      const result = await mealsColl.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // all chef meals
    app.get("/my-meal/:id", async (req, res) => {
      const chefId = req.params.id;
      const result = await mealsColl.find({ chefId}).toArray();
      res.send(result);
    });

    // all users
    app.get("/users", async (req, res) => {
      const result = await usersColl.find().toArray();
      res.send(result);
    });
    // single user
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersColl.findOne({ email });
      res.send(result);
    });

    // all roles
    app.get("/roles", async (req, res) => {
      const result = await rolesColl.find().toArray();
      res.send(result);
    });

    //  user's favorite
    app.get("/favorite-meal/:email", async (req, res) => {
      const email = req.params.email;
      const result = await favoriteColl.find({ userEmail: email }).toArray();
      res.send(result);
    });
    //  user's reviews
    app.get("/review/:email", async (req, res) => {
      const email = req.params.email;
      const result = await reviewsColl.find({ reviewerEmail: email }).toArray();
      res.send(result);
    });

// all reviews for a meal
    app.get("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsColl.find({foodId: id}).toArray();
      res.send(result);
    });

    // order by single user
    app.get('/order/:email', async (req, res)=>{
      const email = req.params.email;
      const result = await ordersColl.find({userEmail: email}).toArray();
      res.send(result)
    })

  // chef's order requests
  app.get('/order/chef/:id', async (req, res)=>{
      const chefId = req.params.id;
      console.log(req);
      const result = await ordersColl.find({chefId}).toArray();
      res.send(result)
    })


    // PATCH REQUESTS
    // update role
    function generateChefId() {
      const randomNumber = Math.floor(1000 + Math.random() * 9000);
      return `chef-${randomNumber}`;
    }
    app.patch("/user/:email", async (req, res) => {
      const email = req.params.email;
      const {role} = req.query;

      if(role==="chef"){
        const update = {
          $set: {
            role: 'chef',
            chefId: generateChefId(),
          }}

        const result = await usersColl.findOneAndUpdate({email}, update, {
            returnDocument: "after",
          })
      return res.send(result);
      };
      const update = {
        $set:{role: role},
        $unset:{"chefId":""}
      }
      const result = await usersColl.findOneAndUpdate({email}, update);
      res.send(result)
      console.log(result);
    });


    // Order Process
    app.patch('/order/change-status/:id', async(req, res)=>{
      const id = req.params.id;
      const {status}= req.query;

      const query = {
        _id: new ObjectId(id)
      }
      const update = {
        $set:{
          orderStatus: status
        }
      }
      const result = await ordersColl.updateOne(query, update);
      res.send(result)
    })

// DELETE REQUESTS
// role request delete
app.delete('/role/:email', async(req, res)=>{
  const userEmail = req.params.email;
  const result = await rolesColl.deleteOne({userEmail});
  res.send(result)
})
// favorite meal  delete
app.delete('/favorite/:id', async(req, res)=>{
  const id = req.params.id;
  const result = await favoriteColl.deleteOne({_id: new ObjectId(id)});
  res.send(result)
})

    // STRIPE PAYMENT API
    app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price: '{{PRICE_ID}}',
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.BASE_URL/payment-success}`,
    cancel_url: process.env.BASE_URL
  });

  res.redirect(303, session.url);
});


app.get('/session-status', async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

  res.send({
    status: session.status,
    customer_email: session.customer_details.email
  });
})












    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server..");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
