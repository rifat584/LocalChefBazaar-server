require("dotenv").config();
const express = require("express");
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
      "http://localhost:5173",
      "http://localhost:5174",
      "https://b12-m11-session.web.app",
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
      
      const existingReview = await reviewsColl.findOne({reviewerImage: reviewData.reviewerImage})
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

      const existingFavorite = await favoriteColl.findOne({ mealId: id });
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
      const result = await ordersColl.insertOne(ordersData);
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

    // single user's favorite
    app.get("/favorite/:email", async (req, res) => {
      const email = req.params.email;
      const result = await rolesColl.findOne({ email });
      res.send(result);
    });

// all reviews for a meal
    app.get("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const result = await reviewsColl.find({foodId: id}).toArray();
      res.send(result);
    });






    // PATCH REQUESTS
    // update role
    function generateChefId() {
      const randomNumber = Math.floor(1000 + Math.random() * 9000);
      return `chef-${randomNumber}`;
    }
    app.patch("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        email,
      };
      const update = {
        $set: {
          role: "chef",
          chefId: generateChefId(),
        },
      };
      const result = await usersColl.findOneAndUpdate(query, update, {
        returnDocument: "after",
      });
      res.send(result);
    });

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
