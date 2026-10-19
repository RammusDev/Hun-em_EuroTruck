export async function GET(req:Request){return Response.redirect(new URL('/journey',req.url),307);}
