import { GoogleGenerativeAI } from "npm:@google/generative-ai";

Deno.serve(async (req) => {

  try {

    const { message } = await req.json();

    const apiKey = Deno.env.get("GEMINI_API_KEY");

    const genAI = new GoogleGenerativeAI(apiKey!);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash"
    });

    const result = await model.generateContent(message);

    const response = await result.response;

    return new Response(
      JSON.stringify({
        success: true,
        reply: response.text()
      }),
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }

});