export const validate = (schema) => {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                res.status(400).json({
                    error: "Validation failed",
                    details: result.error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
                return;
            }
            req.body = result.data;
            next();
        }
        catch (error) {
            console.error("Validation middleware error:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    };
};
