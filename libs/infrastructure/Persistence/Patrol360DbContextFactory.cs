using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Patrol360.Infrastructure.Persistence;

internal sealed class Patrol360DbContextFactory : IDesignTimeDbContextFactory<Patrol360DbContext>
{
    public Patrol360DbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<Patrol360DbContext>()
            .UseNpgsql("Host=localhost;Port=5432;Database=patrol360;Username=patrol360;Password=patrol360_dev")
            .Options;

        return new Patrol360DbContext(options);
    }
}
