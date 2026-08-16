const prisma = require("./lib/prisma");

async function main() {
  try {
    const credential = await prisma.YouTubeCredential.findUnique({
      where: { id: "singleton" }
    });
    
    if (credential) {
      console.log("SUCCESS: YouTube channel is connected.");
      console.log("Expiry Date:", new Date(Number(credential.expiryDate)).toLocaleString());
    } else {
      console.log("FAILURE: No YouTube channel connected in the database.");
    }
  } catch (error) {
    console.error("ERROR: Unable to query the database:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
